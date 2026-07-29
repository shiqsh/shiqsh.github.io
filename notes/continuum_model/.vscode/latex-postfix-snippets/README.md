# LaTeX Postfix Snippets

This local VS Code extension reads the standard user `snippets/latex.json` file
and supplements snippet completions when a trigger is adjacent to earlier text.

For example, if the user snippet prefix is `im`, both ` im` and `Aim` can offer
the same snippet. Native VS Code handles the first case; this extension handles
the second and replaces only the `im` suffix.

The `latexPostfixSnippets.expandScriptOrNextPlaceholder` command resolves the
Tab-key conflict inside an active snippet: a trailing `^` or `_` expands first;
otherwise Tab advances to the next placeholder as usual.

Postfix matches remain available but do not preselect themselves or outrank
normally scored exact matches such as `\sim`.
