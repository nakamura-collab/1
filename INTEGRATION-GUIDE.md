# Ghost Aspect テーマ - パートナー詳細ページ 導入ガイド

BAK Partners Connect 2025風のパートナー詳細ページを、Aspectテーマに追加する手順です。

---

## ファイル構成

```
このリポジトリのファイル:
├── custom-partners-detail.hbs   → テーマのルートにコピー
├── assets/css/partners-detail.css → テーマの assets/css/ にコピー
└── sample-content.html           → Ghost管理画面で入力するHTMLの参考
```

---

## 導入手順

### Step 1: テンプレートファイルをコピー

Aspectテーマのフォルダに以下のファイルをコピーしてください：

```bash
# テンプレートファイル
cp custom-partners-detail.hbs /path/to/aspect/

# CSSファイル
cp assets/css/partners-detail.css /path/to/aspect/assets/css/
```

コピー後のAspectテーマのフォルダ構成:
```
aspect/
├── custom-partners-detail.hbs  ← 追加
├── default.hbs
├── index.hbs
├── post.hbs
├── page.hbs
├── assets/
│   ├── css/
│   │   ├── (既存のCSS)
│   │   └── partners-detail.css  ← 追加
│   └── ...
├── partials/
│   └── ...
└── package.json
```

### Step 2: テーマをGhostにアップロード

1. Aspectテーマフォルダを ZIP に圧縮
2. Ghost管理画面 → Settings → Design → Change theme → Upload theme
3. テーマをアクティベート

### Step 3: パートナー詳細ページを作成

1. Ghost管理画面 → Pages → New page
2. ページの設定（右サイドバー）:
   - **Page URL (Slug)**: `partners2025/kanagawa-shigenjunkan` など
   - **Template**: 「Partners Detail」を選択
   - **Feature image**: ヘッダーに表示する画像を設定
   - **Excerpt**: サブタイトル（ヒーロー部分に表示）
   - **Tags**: 組織名（例：「神奈川県資源循環推進課」）をタグとして追加
3. ページタイトル: メインの見出し（例：「脱炭素・資源循環を実現するバイオプラスチック製品の共創」）

### Step 4: コンテンツを入力

Ghostエディタで **HTMLカード** （「+」ボタン → HTML）を追加し、
`sample-content.html` の内容を参考にHTMLを貼り付けてください。

---

## 使用できるCSSクラス一覧

HTMLカード内で以下のCSSクラスを使用できます：

| クラス名 | 用途 |
|---|---|
| `pd-background` | 背景グレーのボックス（課題背景セクション） |
| `pd-theme-grid` | テーマカードの2列グリッドコンテナ |
| `pd-theme-card` | 募集テーマのカード |
| `pd-theme-card--full` | 幅いっぱいのテーマカード |
| `pd-theme-card__number` | テーマ番号バッジ（丸い赤い数字） |
| `pd-theme-card__title` | テーマカードのタイトル |
| `pd-theme-card__desc` | テーマカードの説明文 |
| `pd-resources` | リソース・強みセクション（赤い左ボーダー） |
| `pd-resources__title` | リソースセクションの見出し |
| `pd-info-table` | 募集概要テーブル |
| `pd-steps` | 共創プロセスのステップリスト（番号付き） |
| `pd-apply-btn` | 応募ボタン（赤い丸ボタン） |
| `pd-highlight` | ハイライトボックス（黄色背景） |
| `pd-tags` | タグバッジのコンテナ |
| `pd-tag` | タグバッジ |
| `pd-tag--primary` | 赤色のタグバッジ |

---

## カスタマイズ

### カラー変更

`assets/css/partners-detail.css` の先頭にあるCSS変数を編集してください：

```css
:root {
  --pd-primary: #d72f2d;       /* メインカラー（赤） */
  --pd-primary-dark: #b82625;  /* ホバー時のカラー */
  --pd-bg-dark: #1a1a2e;       /* ヒーロー背景色 */
}
```

### CTAボタンのリンク先

`custom-partners-detail.hbs` の以下の部分を編集してください：

```html
<a href="#apply" class="pd-cta__button">応募フォームへ</a>
```

CTAのテキストやリンク先を変更する場合は、テンプレートを直接編集するか、
コンテンツ内の `pd-apply-btn` ボタンのみを使用してください。

---

## 注意事項

- Ghostのルーティング設定でスラッグをカスタマイズする場合は `routes.yaml` の編集が必要です
- Aspectテーマのバージョンアップ時は、追加したファイルを再度コピーする必要があります
- `sample-content.html` はテーマには含まれません。コンテンツ入稿時の参考用です
