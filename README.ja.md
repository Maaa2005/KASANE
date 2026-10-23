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
  146 estimated tokens
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

### 他ツールとの比較

エージェントの設定ファイルをlintする発想は新しくありません。下の2つは、
一部の機能ではKASANEより優れています。

| ツール | 何をするか | KASANEとの重なり |
| --- | --- | --- |
| [agentlinter](https://github.com/seojoonkim/agentlinter) | 「AIエージェント版ESLint」。`AGENTS.md`/`CLAUDE.md`を採点・自動修正し、モデルが読み飛ばしやすいファイル中央部のルールを警告、トークン効率と秘密情報も検査する。 | 大きい。ルール数はKASANEの7個より多く、しかも自動修正まで行う。 |
| [ai-context-kit](https://github.com/ofershap/ai-context-kit) | ファイルごとのトークン量を予算と照合し、矛盾と重複を検出。タスクに関係するルールだけを選ぶ`select()`を持つ。 | 大きい。`select()`に相当する機能はKASANEにない。 |
| [cursor-doctor](https://github.com/nedcodes-ok/cursor-doctor) | Cursorのルール専用に100項目以上を診断し、エディタ上で自動修正する。 | Cursor限定。その範囲ではKASANEより深い。 |

どれもやっていないのが、**「なぜこのエージェントだけ挙動が違うのか」**への
回答です。3つともファイル単体を検証します。KASANEは各ファイルを、
1つのエージェントが特定のファイルを編集するときに実際に受け取る指示まで
解決してから、それをエージェント間で差分にします。`kasane diff` と
`kasane explain --path` はそのためにあります。

自動修正やタスク単位のトークン予算が欲しいなら上のツールを使ってください。
KASANEは、エージェント同士が食い違っていて原因を知りたいときに使います。

(各リポジトリを2026年7月に確認した内容です。スター数も活動状況も動くので、
比較表を信じる前に実物を見てください。)

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
kasane explain --agent <codex|claude|cursor|gemini|copilot> [--path <file|dir>]
kasane diff --agents <agent,agent,...> [--path <file|dir>]
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
`explain`/`diff`は`--path <file|dir>`で対象のファイルかディレクトリを指定でき、
ディレクトリ階層やCursorの`globs`によるスコープ解決を反映した結果を返します。
ディレクトリを指定した場合は、そのディレクトリと親にある設定ファイルと、
配下のいずれかのファイルに一致する`globs`付きルールが対象です。
パスは`--root`を基準に解決し、その外は指定できません。

終了コード: `0` 成功、`1` `--fail-on`以上の診断あり、`2` 引数の誤り
(不明なオプション、不正な`--format`、ディレクトリでない`--root`、
リポジトリ外の`--path`)、`3` 解析の失敗、`4` 想定外のエラー。

## 対応エージェント・設定ファイル

| エージェント   | ファイル                                                          |
| -------------- | -------------------------------------------------------------------- |
| OpenAI Codex   | `AGENTS.md`                                                          |
| Claude Code    | `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md`                  |
| Cursor         | `.cursor/rules/**/*.mdc`、`.cursorrules`、`AGENTS.md`                |
| Gemini CLI     | `GEMINI.md`                                                          |
| GitHub Copilot | `.github/copilot-instructions.md`(リポジトリ直下のみ)               |
| MCPサーバー    | `.mcp.json`、`mcp.json`、`.cursor/mcp.json`、`.claude/mcp.json`(検出のみ、指示としては解析しない) |

Cursorルールは任意の深さの`.cursor/rules`から読み、Cursorのルール種別に
従います。`alwaysApply: true`のルールは属するサブツリー全体に届き、`globs`
は無視します。それ以外は`globs`に一致するファイルに限定します。`globs`は
リスト・単一の文字列・カンマ区切りの文字列のどれでもよく、`{ts,tsx}`の
中のカンマは区切りとして扱いません。`description`だけのルールはサブツリー
全体に届くものとして扱います。どれも無いルールは@で指定したときだけ適用
され、`.cursor/rules`内の`.md`ファイルはルールではありません。この2つは
`explain`と`diff`には含めませんが、`inspect`では検査します。

### 既知の制限(v0.3.0では再現しない範囲)

KASANEは**静的解析で再現できる範囲**のみを対象とします。以下は意図的に
対象外です。

- 説明文に基づいて適用されるルールを、エージェントが実行時に実際に読み込むか
  どうか(Agent-Requested rulesは、そのルールが属するサブツリー全体に届くもの
  として報告します。これは上限値であり、実行時の予測ではありません)
- エージェント内部でのみ解決される参照構文(例: Claude Codeの`@path`インポート)
- Claude CodeとCopilotにとっての`AGENTS.md`。Claude Codeは`CLAUDE.md`が
  無いときだけ読み、Copilotは対象ファイルに最も近い1つだけを読みます。
  どちらも再現しないため、`AGENTS.md`はCodexとCursorの分だけ数えます
- エージェントのバージョンやプラットフォーム差による挙動の違い
- リポジトリルート以外の`.gitignore`。検出ファイルの除外にはルートの
  `.gitignore`と`.git/info/exclude`のみを適用します。独自の`.git`を持つ
  ディレクトリ(worktree・submodule)は別のリポジトリとして読み飛ばします
- ワークスペース配下のパッケージが使うパッケージマネージャ。KASANE004は
  ルートのロックファイルとルートの`package.json`の`packageManager`だけを
  読みます(KASANE003はパッケージ自身の`package.json`のscriptsも照合します)
- 設定ファイル内の相対パスがどこを起点にしているか。KASANE002はリポジトリ
  ルートと設定ファイル自身のディレクトリのどちらかから見て存在すれば
  問題なしとします。入れ子の`CLAUDE.md`がルートの`docs/`のつもりで
  `docs/x.md`と書いても、その逆でも報告しません

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

## リリース作業チェックリスト

v0.2.0をどう公開したかの記録として残しています。未完了は7だけです。

1. 対応済み: https://github.com/Maaa2005/KASANE (デフォルトブランチ`main`)へpush済み
2. 対応済み: npmで`kasane`は使用済みだったため、公開名は`kasane-cli`(`package.json`の`name`)。
   コマンド名は`kasane`のまま
3. 対応済み: `docs/make-demo.sh` で `docs/demo.gif` を生成し、README冒頭に埋め込み済み
4. 対応済み: 「なぜKASANEが必要か」にagentlinter / ai-context-kit / cursor-doctorとの比較を記載
5. 対応済み: `v0.2.0`タグpushで`kasane-cli@0.2.0`として公開
6. 対応済み: https://github.com/Maaa2005/KASANE/releases/tag/v0.2.0
7. 計画書§26の公開・プロモーション計画に沿って初期告知を行う

## 変更履歴

[CHANGELOG.md](./CHANGELOG.md)を参照してください。

## ライセンス

MIT — [LICENSE](./LICENSE)を参照してください。
