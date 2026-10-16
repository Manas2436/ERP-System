# Database Seed Guidelines & Examples

## Purpose
This directory contains reference seed templates for development and testing environments.

## Security Rules
1. **Never commit hardcoded plaintext passwords or pre-computed password hashes with known defaults.**
2. **Never seed real users automatically in migrations or production deployments.**
3. In this ERP system, **public registration does not exist**. Initial administrative bootstrapping can be accomplished either:
   - Via an administrative CLI script that securely reads environment variables or prompts for the password interactively and hashes it with bcrypt (cost factor >= 12).
   - Via authorized Admin user management endpoints (`POST /api/v1/admin/users`) once implemented in Stage 6.

## Development Seed Example (`001_seed_initial_admin.example.sql`)
The file `001_seed_initial_admin.example.sql` provides a commented template showing the column structure. 
To generate a secure hash for development testing:
```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('YourSecureAdminPasswordHere', 12));"
```
Then replace `<GENERATED_BCRYPT_HASH>` with the output.
