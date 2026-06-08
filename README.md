# pi-mascot

A Pi extension that adds a mascot.

## Install

From npm:

```bash
pi install npm:pi-mascot
```

From GitHub:

```bash
pi install git:github.com/RespectMathias/pi-mascot
```

Local development:

```bash
pi -e ./src/index.ts
```

## Commands

```text
/copy-all
```

Default shortcut:

```text
ctrl+alt+a
```

No built-in keybindings are changed by this extension.

## Development

```bash
npm install
npm run check
npm run pack:dry
```

## Publishing

```bash
npm login
npm publish
```

GitHub setup:

```bash
git init
git add .
git commit -m "Initial release"
git branch -M main
git remote add origin https://github.com/RespectMathias/pi-mascot.git
git push -u origin main
```

## License

MIT © RespectMathias
