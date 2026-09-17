# Security

Report anything that looks like a vulnerability to security@cultifolio.com.
Please do not open a public issue for it. You will get a reply within a few
days and credit in the fix unless you would rather not.

What is in scope, and what the design promises:

- The sync server stores ciphertext only. It holds a hash of a token derived
  from the vault key and can neither read a plant name nor recover a key.
  Anything that breaks that is a vulnerability.
- Vault keys are 30 symbols (~147 bits) drawn without bias; ids and tokens
  are derived with HKDF-SHA-256; blobs are AES-256-GCM with the vault id and
  purpose as associated data. The scheme is documented at `/about/formats`.
- The app collects nothing about you. There are no accounts and no
  analytics. A change that adds either is a bug.

Out of scope: the third-party data sources the corpus is built from, and
rate limits on the public APIs it reads.
