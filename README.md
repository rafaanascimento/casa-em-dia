# Casa em Dia

Base inicial de um projeto Next.js com App Router e TypeScript.

## Estrutura inicial de banco (Supabase)

Foi adicionada a migration `supabase/migrations/20260326_initial_structure.sql` com:

- `profiles` (dados básicos do usuário autenticado)
- `families` (casa/família compartilhada)
- `family_members` (relação usuário-família)

Também foi incluído um trigger em `auth.users` que cria automaticamente um `profile` ao registrar um novo usuário.
