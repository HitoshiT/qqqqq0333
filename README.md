# GARMENT ARCHIVE

個人の衣服を型番・商品名から記録するためのWebアプリ。

- 開発中。アプリ本体と検索APIを段階的に登録します。
- APIキーや個人の衣服データはコミットしません。
- 公開前にアクセス制限とAPI利用上限を設定してください。


## Vercelで公開する（既存のGitHubリポジトリを利用）

1. https://vercel.com/new を開いてGitHubアカウントでログイン。
2. 既存の \`HitoshiT/qqqqq0333\` を選び **Import** する（cloneして新しいリポジトリを作らない）。
3. Framework Preset: **Other**、Root Directory: **./** を選択。
4. Environment Variablesに \`OPENAI_API_KEY\` と \`APP_ACCESS_PIN\` を登録（値はGitHubやチャットに書き込まない）。
5. **Deploy** を押す。Deploy完了後のURLでアプリ画面と \`/api/lookup\` を確認する。

検索APIは環境変数がなければ検索できません。OPENAI_API_KEYはChatGPTの契約とは別途API課金です。
APP_ACCESS_PINは簡易的な検索コスト保護で、公開サイトへのユーザー認証や回数制限ではありません。

### アプリの公開範囲に注意

GitHubのPublic/PrivateとVercel上のサイトの公開設定は別です。
プライベートにしたい場合は両方のアクセス設定を確認してください。
衣服の所有リスト・個人の画像・APIキーをGitHubにコミットしないでください。
