# CI/CD Workflows

Bu papka GitHub Actions workflow fayllarini o'z ichiga oladi.

## Workflows

### CI (Continuous Integration) - `ci.yml`

**Trigger:**
- Push to `main`, `master`, `develop` branches
- Pull requests to `main`, `master`, `develop` branches

**Jobs:**
1. **lint-and-test** - Code linting va testing
   - Python 3.11 va 3.12 uchun test
   - flake8 linting
   - black code formatting check
   - mypy type checking
   - JavaScript syntax check
   - Backend tests
   - Integration tests

2. **build-docker** - Docker image build va test
   - Docker image yaratish
   - Docker image test qilish

3. **security-scan** - Security scanning
   - Bandit security scan
   - Safety dependency check

### CD (Continuous Deployment) - `cd.yml`

**Trigger:**
- Push to `main` yoki `master` branches
- Version tags (`v*`)
- Manual workflow dispatch

**Jobs:**
1. **build-and-push** - Docker image build va push
   - GitHub Container Registry ga push
   - Multiple tags (branch, version, latest)

2. **deploy-staging** - Staging environment ga deploy
   - `develop` branch yoki manual staging
   - Smoke tests

3. **deploy-production** - Production environment ga deploy
   - `main`/`master` branch yoki version tags
   - Smoke tests
   - Deployment notification

4. **docker-compose-deploy** - Docker Compose orqali deploy
   - SSH orqali remote server ga deploy

5. **kubernetes-deploy** - Kubernetes orqali deploy
   - Kubernetes cluster ga deploy

## Setup

### GitHub Secrets

Quyidagi secrets ni GitHub repository Settings > Secrets ga qo'shing:

#### CI uchun:
- Hech qanday secret kerak emas (public repository uchun)

#### CD uchun:
- `SSH_PRIVATE_KEY` - SSH private key (Docker Compose deploy uchun)
- `SSH_USER` - SSH user (Docker Compose deploy uchun)
- `SSH_HOST` - SSH host (Docker Compose deploy uchun)
- `KUBECONFIG` - Kubernetes config (base64 encoded) (Kubernetes deploy uchun)

### GitHub Environments

GitHub repository Settings > Environments ga quyidagilarni qo'shing:

1. **staging**
   - Environment URL: `https://staging.example.com`
   - Protection rules (optional)

2. **production**
   - Environment URL: `https://app.example.com`
   - Required reviewers (optional)
   - Deployment branches: `main`, `master`

## Customization

### Deployment Commands

`cd.yml` faylida deployment commands ni o'zgartiring:

```yaml
- name: Deploy to production
  run: |
    # Your deployment commands here
    ssh user@server "cd /app && docker-compose up -d"
```

### Environment Variables

Environment variables ni workflow fayllarida yoki GitHub Secrets da qo'shing:

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  SECRET_KEY: ${{ secrets.SECRET_KEY }}
```

## Monitoring

Workflow runs ni GitHub Actions tab da kuzatishingiz mumkin:
- https://github.com/YOUR_USERNAME/YOUR_REPO/actions

## Troubleshooting

### CI fails
- Linting errors: `flake8` yoki `black` natijalarini tekshiring
- Test failures: `comprehensive_qa_test.py` natijalarini tekshiring
- Build errors: Docker build loglarini tekshiring

### CD fails
- SSH connection: SSH keys va permissions ni tekshiring
- Docker push: GitHub token permissions ni tekshiring
- Deployment: Server connection va permissions ni tekshiring

