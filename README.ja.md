# KASANE

[![CI](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml/badge.svg)](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kasane.svg)](https://www.npmjs.com/package/kasane)
[![license](https://img.shields.io/npm/l/kasane.svg)](./LICENSE)

> AIコーディングエージェントが実際に受け取っているコンテキストをデバッグする。

KASANEは、AGENTS.md・CLAUDE.md・Cursor rules・GEMINI.md・Copilot
instructions・MCP設定を解析し、重複した指示・存在しないファイル参照・
コンテキスト肥大化・エージェント間の差分を検出するCLIツールです。

English README: [README.md](./README.md)

<!--
TODO(公開前): `kasane inspect` / `explain` / `diff` を実際に動かした
GIFまたはasciinemaに差し替える。デモの録画・公開は人間が行う手動作業
(下記「公開作業チェックリスト」参照)。
-->

## 30秒でわかる使い方

```bash
npx kasane inspect
```

```text
KASANE

Repository:
  /Users/example/project

Detected:
  ✓ AGENTS.md
  ✓ CLAUDE.md
  ✓ 3 Cursor rules
  ✓ 2 MCP servers

Context:
  7 files
  8,421 estimated tokens
  36 instructions

Issues:
  2 duplicated instructions
  1 broken file reference
  1 package-manager conflict
  1 possible secret

Run `kasane explain --agent claude` for details.
```

## なぜKASANEが必要か

同一リポジトリで複数のAIコーディングエージェント(Codex、Claude Code、
Cursor、Gemini CLI、Copilot)を使うと、次のような問題が見えにくくなります。

- エージェントごとに異なる指示ファイルを読み込む
- 同じ内容が複数ファイルに重複している
- 指示同士が矛盾している
- 古いコマンドや存在しないファイルが参照されている
- コンテキストが気づかないうちに肥大化している
- 特定のエージェントだけ挙動が違う原因が分からない

KASANEは各エージェントが実際に受け取る有効コンテキストを再現し、
ファイルの一覧を出すだけでなく、問題の原因を説明します。

## インストール

```bash
npx kasane inspect
# または
npm install -g kasane
```

Node.js >= 20 が必要です。

## コマンド

```bash
kasane inspect
kasane explain --agent <codex|claude|cursor|gemini|copilot> [--path <file>]
kasane diff --agents <agent,agent,...> [--path <file>]
```

| コマンド    | 用途                                                             |
| ----------- | ------------------------------------------------------------------ |
| `inspect`   | リポジトリ全体を解析し、検出した診断結果を表示する                 |
| `explain`   | 特定エージェントに適用される有効コンテキスト(ファイル・指示)を表示する |
| `diff`      | 複数エージェント間の有効コンテキストを比較する                     |

共通オプション: `--root <path>`(解析対象、デフォルト `.`)、
`--format text|json`、`--verbose`。
`inspect`はCI向けに`--fail-on warning|error`にも対応します。
`explain`/`diff`は`--path <file>`で対象ファイルを指定でき、
ディレクトリ階層やCursorの`globs`によるスコープ解決を反映した結果を返します。

## 対応エージェント・設定ファイル

| エージェント   | ファイル                                                          |
| -------------- | -------------------------------------------------------------------- |
| OpenAI Codex   | `AGENTS.md`                                                          |
| Claude Code    | `CLAUDE.md`、`CLAUDE.local.md`                                       |
| Cursor         | `.cursor/rules/**/*.md`、`.cursor/rules/**/*.mdc`、`.cursorrules`    |
| Gemini CLI     | `GEMINI.md`                                                          |
| GitHub Copilot | `.github/copilot-instructions.md`                                    |
| MCPサーバー    | `.mcp.json`、`mcp.json`、`.cursor/mcp.json`、`.claude/mcp.json`(検出のみ、指示としては解析しない) |

### 既知の制限(v0.1.0では再現しない範囲)

KASANEは**静的解析で再現できる範囲**のみを対象とします。以下は意図的に
対象外です。

- エージェントが実行時に動的に適用可否を判断するルール(例: Cursorの
  `alwaysApply: false` によるAgent-Requested rules)
- エージェント内部でのみ解決される参照構文(例: Claude Codeの`@path`インポート)
- エージェントのバージョンやプラットフォーム差による挙動の違い

## ローカルでの静的解析のみ

KASANEはファイルをどこにも送信しません。ネットワーク通信・LLM呼び出し・
テレメトリー・外部APIキーは一切使用せず、ローカルの単一プロセスとして
ディスク上のファイルのみを解析します。

## 推定トークン数について

トークン数は`js-tiktoken`(OpenAI系トークナイザー)による**推定値**です。
Claude・Geminiなど他モデルの正確なトークン数とは一致しません。
エージェント間・ファイル間の相対的な比較のための概算値として扱ってください。

## ロードマップ

- [ ] `.github/instructions/**/*.instructions.md`(GitHub Copilotの新形式)
- [ ] Windsurf(`.windsurfrules`)/ Cline(`.clinerules`)/ Roo(`.roo/rules/**`)
- [ ] その他、報告された未対応の設定ファイル形式

未対応の設定ファイル形式の報告は`good first issue`として受け付けています。
[CONTRIBUTING.md](./CONTRIBUTING.md)を参照してください。

## コントリビューション

バグ報告・機能要望・未対応の設定ファイル形式の報告を歓迎します。
[CONTRIBUTING.md](./CONTRIBUTING.md)と[Code of Conduct](./CODE_OF_CONDUCT.md)を参照してください。

## セキュリティ

脆弱性の報告方法は[SECURITY.md](./SECURITY.md)を参照してください。

## 公開作業チェックリスト(手動)

以下はすべて自動化しておらず、リポジトリ・npmパッケージの準備が
整った後に人間が実行する必要があります。

1. `git init`し、`https://github.com/Maaa2005/KASANE`(デフォルトブランチ`main`)へpush
2. npmで`kasane`という名前が利用可能か確認(`npm view kasane`)。使用不可の場合は
   `package.json`の`name`(公開名を定義する唯一の場所)とバッジURLを更新する
3. `inspect` / `explain` / `diff`を実行したターミナルデモ(GIFまたはasciinema)を録画し、
   README冒頭に埋め込む
4. 「なぜKASANEが必要か」節を、実際の競合調査結果に基づく比較に更新する(計画書§1.4)
5. `npm login`後、`npm publish`(またはタグpushで`.github/workflows/publish.yml`を起動)し、
   最初の`v0.1.0`をリリースする
6. GitHub Releaseとタグ`v0.1.0`を作成する
7. 計画書§26の公開・プロモーション計画に沿って初期告知を行う

## 変更履歴

[CHANGELOG.md](./CHANGELOG.md)を参照してください。

## ライセンス

MIT — [LICENSE](./LICENSE)を参照してください。
