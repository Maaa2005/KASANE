# KASANE

[![CI](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml/badge.svg)](https://github.com/Maaa2005/KASANE/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/kasane-cli.svg)](https://www.npmjs.com/package/kasane-cli)
[![license](https://img.shields.io/npm/l/kasane-cli.svg)](./LICENSE)

> AIコーディングエージェントが実際に受け取っているコンテキストをデバッグする。

KASANEは、AGENTS.md・CLAUDE.md・Cursor rules・GEMINI.md・Copilot
instructions・MCP設定を解析し、重複した指示・存在しないファイル参照・
コンテキスト肥大化・エージェント間の差分を検出するCLIツールです。

English README: [README.md](./README.md)

![kasane inspect / diff / explain を実際のリポジトリで実行したデモ](https://raw.githubusercontent.com/Maaa2005/KASANE/main/docs/demo.gif)

## 30秒でわかる使い方

`AGENTS.md`・`CLAUDE.md`・ネストした `src/CLAUDE.md`・Cursorルール・
Copilot instructions・MCP設定があるリポジトリの場合:

```bash
npx kasane-cli inspect
```

```text
KASANE

Repository:
  /private/tmp/acme-web

Detected:
  ✓ .cursor/rules/typescript.mdc (Cursor rule)
  ✓ .github/copilot-instructions.md (Copilot instructions)
  ✓ .mcp.json (MCP server config)
  ✓ AGENTS.md (AGENTS.md)
  ✓ CLAUDE.md (CLAUDE.md)
  ✓ src/CLAUDE.md (CLAUDE.md)

Context:
  6 files
  143 estimated tokens
  10 instructions

Issues:
  2 error(s), 2 warning(s), 0 info

  [warning] KASANE001 .github/copilot-instructions.md:1 — Duplicated instruction
    The same instruction appears in 3 files: "Write tests for new features."
  [error] KASANE002 AGENTS.md:9 — Broken file reference
    docs/architecture.md does not exist
  [error] KASANE003 CLAUDE.md:7 — Missing package.json script
    "pnpm run lint:fix" is referenced but package.json has no "lint:fix" script
  [warning] KASANE004 AGENTS.md:7 — Package manager mismatch
    Instruction mentions "npm" but the repository lockfile indicates "pnpm"
```

「なぜこのエージェントだけ挙動が違うのか」はこう調べます:

```bash
kasane diff --agents codex,claude
```

```text
Context difference

Codex only:
  + Run `pnpm test` before every commit.
  + Use npm for installing dependencies.
  + See the architecture notes before large changes.

Claude Code only:
  + Use pnpm for installing dependencies.
  + Run `pnpm lint:fix` after editing.
  + Prefer named exports in this directory.

Common:
  Write tests for new features.
```

上の2つはどちらも実際の出力そのままです。この例リポジトリの生成と
GIFの再録画は `docs/make-demo.sh` で行えます。

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
npx kasane-cli inspect
# または
npm install -g kasane-cli
```

公開パッケージ名は `kasane-cli`、インストールされるコマンド名は `kasane` です。

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
`--format text|json`、`--include-content`。

JSON出力は既定で各設定ファイルの全文を含めません。コンテキストファイルに
秘密情報が書かれていた場合に、それを報告する診断と一緒にCIログへ複製して
しまわないためです。全文が必要なときは`--include-content`を付けてください。
どちらの場合も秘密情報らしき文字列はマスクされます。
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

### 既知の制限(v0.2.0では再現しない範囲)

KASANEは**静的解析で再現できる範囲**のみを対象とします。以下は意図的に
対象外です。

- 説明文に基づいて適用されるルールを、エージェントが実行時に実際に読み込むか
  どうか(Agent-Requested rulesは、そのルールが属するサブツリー全体に届くもの
  として報告します。これは上限値であり、実行時の予測ではありません)
- エージェント内部でのみ解決される参照構文(例: Claude Codeの`@path`インポート)
- エージェントのバージョンやプラットフォーム差による挙動の違い
- リポジトリルート以外の`.gitignore`。検出ファイルの除外にはルートの
  `.gitignore`のみを適用します
- ワークスペース配下の`package.json` scripts。KASANE003は常にルートの
  `package.json`と照合するため、ワークスペース内でのみ有効なコマンドを
  「存在しない」と報告します

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
2. 対応済み: npmで`kasane`は使用済みだったため、公開名は`kasane-cli`(`package.json`の`name`)。
   コマンド名は`kasane`のまま
3. 対応済み: `docs/make-demo.sh` で `docs/demo.gif` を生成し、README冒頭に埋め込み済み
4. 「なぜKASANEが必要か」節を、実際の競合調査結果に基づく比較に更新する(計画書§1.4)
5. `npm login`後、`npm publish`(またはタグpushで`.github/workflows/publish.yml`を起動)し、
   `v0.2.0`をリリースする
6. GitHub Releaseとタグ`v0.2.0`を作成する
7. 計画書§26の公開・プロモーション計画に沿って初期告知を行う

## 変更履歴

[CHANGELOG.md](./CHANGELOG.md)を参照してください。

## ライセンス

MIT — [LICENSE](./LICENSE)を参照してください。
