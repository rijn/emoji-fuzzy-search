# Emoji Fuzzy Search

Emoji fuzzy search by emoji. 🌚

The engine can take not only emoji but also text as queries.

## Use Restful Service

Start the app
```bash
$ yarn start
$ pm2 start server.js --name="emoji-fuzzy-search"
```

Add documents
```bash
$ curl --header "Content-Type: application/json" \
  --request POST \
  --data '{"meta":{"key":"meta can be any json object"},"emoji":"🌚🤔"}' \
  http://localhost:5020/documents
```

Then search by text or emoji
```bash
$ curl http://localhost:5020/search/🤔  # search emoji does not work for curl, demo only
$ curl http://localhost:5020/search/moon?limit=1
```

## Development

Start the script
```bash
$ yarn cli
```
