// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package commands

import (
	"bufio"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/pmezard/go-difflib/difflib"
	"github.com/spf13/cobra"

	"github.com/authelia/authelia/v4/internal/admin"
)

const cmdFlagNameYes = "yes"

func newAdminCmd(ctx *CmdCtx) (cmd *cobra.Command) {
	cmd = &cobra.Command{
		Use:   "admin",
		Short: "Manage the administration area",
		Long: `Manage the administration area.

The administration area can't read files or environment variables the configuration doesn't already use, or change the
directories its file picker can browse, without the confirmation of someone with access to the server. Such changes wait
until they're applied or rejected with the 'changes' subcommands.`,
		Args: cobra.NoArgs,

		DisableAutoGenTag: true,
	}

	cmd.AddCommand(newAdminChangesCmd(ctx))

	return cmd
}

func newAdminChangesCmd(ctx *CmdCtx) (cmd *cobra.Command) {
	cmd = &cobra.Command{
		Use:   "changes",
		Short: "List the configuration changes which wait for a confirmation",
		Example: `authelia admin changes
authelia admin changes show k3f9x2ab
authelia admin changes apply k3f9x2ab
docker exec -it janus authelia admin changes apply k3f9x2ab`,
		Args:    cobra.NoArgs,
		PreRunE: ctx.HelperConfigLoadRunE,
		RunE:    ctx.AdminChangesListRunE,

		DisableAutoGenTag: true,
	}

	show := &cobra.Command{
		Use:     "show <id>",
		Short:   "Show a configuration change which waits for a confirmation",
		Args:    cobra.ExactArgs(1),
		PreRunE: ctx.HelperConfigLoadRunE,
		RunE:    ctx.AdminChangesShowRunE,

		DisableAutoGenTag: true,
	}

	apply := &cobra.Command{
		Use:     "apply <id>",
		Short:   "Show a configuration change and apply it once confirmed",
		Args:    cobra.ExactArgs(1),
		PreRunE: ctx.ChainRunE(ctx.HelperConfigLoadRunE, ctx.LoadTrustedCertificatesRunE),
		RunE:    ctx.AdminChangesApplyRunE,

		DisableAutoGenTag: true,
	}

	apply.Flags().BoolP(cmdFlagNameYes, "y", false, "apply the change without asking for a confirmation")

	reject := &cobra.Command{
		Use:     "reject <id>",
		Short:   "Reject a configuration change which waits for a confirmation",
		Args:    cobra.ExactArgs(1),
		PreRunE: ctx.HelperConfigLoadRunE,
		RunE:    ctx.AdminChangesRejectRunE,

		DisableAutoGenTag: true,
	}

	cmd.AddCommand(show, apply, reject)

	return cmd
}

func (ctx *CmdCtx) adminConfigurationManager() *admin.ConfigurationManager {
	return admin.NewConfigurationManager(ctx.cconfig.files, ctx.cconfig.bfilters, ctx.trusted).WithFileRoots(ctx.config.Administration.FileRoots)
}

// AdminChangesListRunE lists the configuration changes which wait for a confirmation.
func (ctx *CmdCtx) AdminChangesListRunE(cmd *cobra.Command, _ []string) (err error) {
	changes, err := ctx.adminConfigurationManager().PendingChanges()
	if err != nil {
		return fmt.Errorf("error listing the configuration changes: %w", err)
	}

	w := cmd.OutOrStdout()

	if len(changes) == 0 {
		_, _ = fmt.Fprintln(w, "There are no configuration changes waiting for a confirmation.")

		return nil
	}

	for i := range changes {
		writeAdminChange(w, &changes[i], changes[i].Reasons)

		_, _ = fmt.Fprintln(w)
	}

	_, _ = fmt.Fprintln(w, "Run 'authelia admin changes apply <id>' to review and apply a change.")

	return nil
}

// AdminChangesShowRunE shows a configuration change which waits for a confirmation.
func (ctx *CmdCtx) AdminChangesShowRunE(cmd *cobra.Command, args []string) (err error) {
	_, err = reviewAdminChange(cmd.OutOrStdout(), ctx.adminConfigurationManager(), args[0])

	return err
}

// AdminChangesApplyRunE shows a configuration change and applies it once confirmed.
func (ctx *CmdCtx) AdminChangesApplyRunE(cmd *cobra.Command, args []string) (err error) {
	manager := ctx.adminConfigurationManager()
	w := cmd.OutOrStdout()

	var change *admin.PendingChange

	if change, err = reviewAdminChange(w, manager, args[0]); err != nil {
		return err
	}

	if change.Status != admin.PendingStatusPending {
		return fmt.Errorf("the change can't be applied as it's %s", change.Status)
	}

	yes, _ := cmd.Flags().GetBool(cmdFlagNameYes)

	if !yes && !confirmAdminChange(cmd.InOrStdin(), w) {
		_, _ = fmt.Fprintln(w, "The change was not applied.")

		return nil
	}

	var result *admin.ConfigurationValidationResult

	if result, err = manager.ApplyPendingChange(change.ID); err != nil {
		return fmt.Errorf("error applying the change: %w", err)
	}

	if !result.Valid {
		_, _ = fmt.Fprintln(w, "\nThe change was not applied as the configuration is invalid with everything evaluated:")

		for _, e := range result.Errors {
			_, _ = fmt.Fprintf(w, "  - %s\n", e)
		}

		return fmt.Errorf("the configuration is invalid")
	}

	_, _ = fmt.Fprintln(w, "\nThe change was applied. Restart Janus from the administration area or restart the container to use it.")

	return nil
}

// AdminChangesRejectRunE rejects a configuration change which waits for a confirmation.
func (ctx *CmdCtx) AdminChangesRejectRunE(cmd *cobra.Command, args []string) (err error) {
	if err = ctx.adminConfigurationManager().RejectPendingChange(args[0]); err != nil {
		return fmt.Errorf("error rejecting the change: %w", err)
	}

	_, _ = fmt.Fprintln(cmd.OutOrStdout(), "The change was rejected.")

	return nil
}

// reviewAdminChange writes what a change does, worked out again from its content rather than from what was stored with
// it, and the difference to the current file.
func reviewAdminChange(w io.Writer, manager *admin.ConfigurationManager, id string) (change *admin.PendingChange, err error) {
	var (
		current []byte
		result  *admin.ConfigurationValidationResult
	)

	if change, current, result, err = manager.ReviewPendingChange(id); err != nil {
		return nil, fmt.Errorf("error reading the change: %w", err)
	}

	writeAdminChange(w, change, result.Confirmations)

	if len(result.Errors) != 0 {
		_, _ = fmt.Fprintln(w, "\nThe configuration is invalid:")

		for _, e := range result.Errors {
			_, _ = fmt.Fprintf(w, "  - %s\n", e)
		}
	}

	diff, err := difflib.GetUnifiedDiffString(difflib.UnifiedDiff{
		A:        difflib.SplitLines(string(current)),
		B:        difflib.SplitLines(change.Content),
		FromFile: change.Path + " (current)",
		ToFile:   change.Path + " (change)",
		Context:  3,
	})
	if err != nil {
		return nil, err
	}

	if diff == "" {
		diff = "The change doesn't differ from the current file.\n"
	}

	_, _ = fmt.Fprintf(w, "\n%s", diff)

	return change, nil
}

func writeAdminChange(w io.Writer, change *admin.PendingChange, reasons []string) {
	_, _ = fmt.Fprintf(w, "Change %s (%s)\n", change.ID, change.Status)
	_, _ = fmt.Fprintf(w, "  File:      %s\n", change.Path)
	_, _ = fmt.Fprintf(w, "  Submitted: %s by %s\n", change.Created.Local().Format(time.DateTime), change.Username)

	if change.Status == admin.PendingStatusPending {
		_, _ = fmt.Fprintf(w, "  Expires:   %s\n", change.Expires.Local().Format(time.DateTime))
	}

	if len(reasons) != 0 {
		_, _ = fmt.Fprintln(w, "  Needs a confirmation as it:")

		for _, reason := range reasons {
			_, _ = fmt.Fprintf(w, "    - %s\n", reason)
		}
	}
}

func confirmAdminChange(r io.Reader, w io.Writer) bool {
	_, _ = fmt.Fprint(w, "\nApply this change? [y/N]: ")

	answer, _ := bufio.NewReader(r).ReadString('\n')

	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "y", "yes":
		return true
	default:
		return false
	}
}
