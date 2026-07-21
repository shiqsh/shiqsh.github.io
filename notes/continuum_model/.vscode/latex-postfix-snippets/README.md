# LaTeX Postfix Snippets

This local VS Code extension reads the standard user `snippets/latex.json` file
and supplements snippet completions when a trigger is adjacent to earlier text.

For example, if the user snippet prefix is `im`, both ` im` and `Aim` can offer
the same snippet. Native VS Code handles the first case; this extension handles
the second and replaces only the `im` suffix.
