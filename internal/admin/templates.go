// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package admin

import (
	"fmt"
	"regexp"
	"strings"

	"go.yaml.in/yaml/v4"
)

const filterTemplate = "template"

var reTemplateExpression = regexp.MustCompile(`\{\{.*?\}\}`)

// templateExpression is a template expression found in a configuration file which uses the template filter.
type templateExpression struct {
	text string

	// quoted is true when the expression was inside a quoted YAML scalar.
	quoted bool
}

// templates replaces the template expressions of a configuration file with placeholders, so the file can be parsed and
// edited as YAML while the expressions are written back exactly as they were.
type templates struct {
	enabled bool

	byPlaceholder map[string]templateExpression
	byText        map[string]string
	prefix        string
	next          int
}

func newTemplates(enabled bool, content []byte) *templates {
	t := &templates{
		enabled:       enabled,
		byPlaceholder: map[string]templateExpression{},
		byText:        map[string]string{},
		prefix:        "authelia_admin_template_",
	}

	for strings.Contains(string(content), t.prefix) {
		t.prefix += "x_"
	}

	return t
}

// protect returns the content with each single line template expression replaced by a placeholder.
func (t *templates) protect(content []byte) []byte {
	if !t.enabled {
		return content
	}

	lines := strings.Split(string(content), "\n")

	for i, line := range lines {
		matches := reTemplateExpression.FindAllStringIndex(line, -1)

		for j := len(matches) - 1; j >= 0; j-- {
			start, end := matches[j][0], matches[j][1]

			placeholder := t.add(line[start:end], isQuotedContext(line[:start]))

			line = line[:start] + placeholder + line[end:]
		}

		lines[i] = line
	}

	return []byte(strings.Join(lines, "\n"))
}

// restore replaces the placeholders in the text with the template expressions.
func (t *templates) restore(text string) string {
	if !t.enabled || !strings.Contains(text, t.prefix) {
		return text
	}

	for placeholder, expression := range t.byPlaceholder {
		text = strings.ReplaceAll(text, placeholder, expression.text)
	}

	return text
}

// restoreValue replaces the placeholders in every string of a decoded value.
func (t *templates) restoreValue(value any) any {
	switch v := value.(type) {
	case string:
		return t.restore(v)
	case map[string]any:
		for k, item := range v {
			v[k] = t.restoreValue(item)
		}

		return v
	case []any:
		for i, item := range v {
			v[i] = t.restoreValue(item)
		}

		return v
	default:
		return v
	}
}

// protectValue replaces the template expressions in every string of a value with placeholders.
func (t *templates) protectValue(value any) any {
	if !t.enabled {
		return value
	}

	switch v := value.(type) {
	case string:
		return reTemplateExpression.ReplaceAllStringFunc(v, func(expression string) string {
			if placeholder, ok := t.byText[expression]; ok {
				return placeholder
			}

			return t.add(expression, !isSelfQuotingExpression(expression))
		})
	case map[string]any:
		result := make(map[string]any, len(v))

		for k, item := range v {
			result[k] = t.protectValue(item)
		}

		return result
	case []any:
		result := make([]any, len(v))

		for i, item := range v {
			result[i] = t.protectValue(item)
		}

		return result
	default:
		return v
	}
}

// style sets the style of the scalar nodes which contain placeholders so the expressions are rendered as they were
// written: a value which is exactly one unquoted expression stays unquoted, everything else is single quoted.
func (t *templates) style(node *yaml.Node) {
	if !t.enabled || node == nil {
		return
	}

	if node.Kind == yaml.ScalarNode && strings.Contains(node.Value, t.prefix) {
		node.Style = yaml.SingleQuotedStyle

		if expression, ok := t.byPlaceholder[node.Value]; ok && !expression.quoted {
			node.Style = 0
		}

		if strings.Contains(t.restore(node.Value), "'") {
			node.Style = 0
		}
	}

	for _, child := range node.Content {
		t.style(child)
	}
}

func (t *templates) add(expression string, quoted bool) (placeholder string) {
	if placeholder, ok := t.byText[expression]; ok {
		return placeholder
	}

	placeholder = fmt.Sprintf("%s%d_end", t.prefix, t.next)
	t.next++

	t.byPlaceholder[placeholder] = templateExpression{text: expression, quoted: quoted}
	t.byText[expression] = placeholder

	return placeholder
}

// isQuotedContext returns true if the text which precedes a template expression on its line opens a quoted scalar.
func isQuotedContext(prefix string) bool {
	value := strings.TrimLeft(prefix, " \t")

	for strings.HasPrefix(value, "- ") {
		value = strings.TrimLeft(value[2:], " \t")
	}

	if i := strings.Index(value, ": "); i != -1 && !strings.HasPrefix(value, "'") && !strings.HasPrefix(value, `"`) {
		value = strings.TrimLeft(value[i+2:], " \t")
	}

	return strings.HasPrefix(value, "'") || strings.HasPrefix(value, `"`)
}

// isSelfQuotingExpression returns true if a template expression produces an already quoted value.
func isSelfQuotingExpression(expression string) bool {
	for _, function := range []string{"msquote", "mquote", "squote", "quote"} {
		if strings.Contains(expression, "| "+function) || strings.Contains(expression, "|"+function) {
			return true
		}
	}

	return false
}
