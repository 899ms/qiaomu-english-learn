# Word Learning Data Sources

The generated word-learning lexicon is derived from MIT-licensed public data:

- `JavaProgrammerLB/cet-word-list`: CET4/CET6 word membership. Copyright (c) 2024 Bill Lau. Source: https://github.com/JavaProgrammerLB/cet-word-list
- `skywind3000/ECDICT`: English-Chinese definitions, phonetics, and exam tags. Copyright (c) 2025 Linwei. Source: https://github.com/skywind3000/ECDICT

Generation command used locally:

```sh
pnpm generate:word-learning-lexicon -- --cet /tmp/cet-word-list.txt --ecdict /tmp/ecdict.csv --out src/utils/word-learning/generated-lexicon.ts
```

The generated file keeps source links in its header. If the lexicon is redistributed outside this repository, keep these notices and the upstream license references with it.
