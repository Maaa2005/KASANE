# Regenerates docs/demo.gif with https://github.com/charmbracelet/vhs
#
# Run docs/make-demo.sh rather than vhs directly — it builds the example
# repository at /tmp/acme-web and puts the freshly built CLI on PATH first.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1240
Set Height 820
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms

Hide
Type "export PS1='$ '" Enter
Type "cd /tmp/acme-web" Enter
Type "clear" Enter
Show

Sleep 800ms
Type "kasane inspect"
Sleep 500ms
Enter
Sleep 6s

Type "clear" Enter
Sleep 300ms

Type "kasane diff --agents codex,claude"
Sleep 500ms
Enter
Sleep 6s

Type "clear" Enter
Sleep 300ms

Type "kasane explain --agent claude --path src/auth.ts"
Sleep 500ms
Enter
Sleep 5s
