# Segurança

- Senhas com Argon2id.
- JWT de curta duração.
- Refresh token opaco e armazenado apenas por hash.
- Cookie HttpOnly e SameSite.
- RLS com `FORCE ROW LEVEL SECURITY`.
- Hash SHA-256 do token do cartão.
- Apenas os quatro últimos dígitos ficam visíveis.
- Upload limitado e checksum SHA-256.
- Rate limit na API e reforço específico no login.
- Auditoria com correlation ID.
- Papéis: OWNER, ADMIN, ANALYST, OPERATOR e VIEWER.

Antes de produção, troque todos os segredos do `.env`, habilite TLS, use um cofre de segredos e restrinja as portas de infraestrutura.
