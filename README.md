# CoeIA Portal — Backend

Backend serverless del portal de gobierno de IA de Redeban (AWS SAM):
API Gateway + Lambda (Node 20) + DynamoDB + S3 + SES + Cognito. Tambien define
el hosting de la SPA (S3 + CloudFront), que se publica desde el repo del frontend.

## Estructura

```
admin/catalogHandler.js     Excel (S3) -> JSON del catalogo de agentes
faqs/handler.js             GET /faqs + CRUD admin
submissions/handler.js      Solicitudes: PDF -> S3, metadata -> DynamoDB, email SES
shared/                     utils, validation, transform, pdf
__tests__/                  Pruebas (node --test)
infra/template.yaml         IaC (AWS SAM)
samconfig.toml              Configuracion de despliegue
deploy-cloudshell.sh        Despliegue desde AWS CloudShell
```

## Pruebas

```
npm install
npm test
```

## Despliegue

Desde CloudShell, en la raiz de este repo:

```
SENDER_EMAIL=noreply@redeban.com RECIPIENT_EMAIL=coe-ia@redeban.com \
ADMIN_PASSWORD='ClaveSegura12+!' bash deploy-cloudshell.sh
```

O manualmente:

```
sam build --template infra/template.yaml
sam deploy --guided
```

## Contrato con el frontend

El frontend lee estas salidas del stack (CloudFormation Outputs):

| Output | Variable del frontend |
|---|---|
| `ApiBaseUrl` | `VITE_API_BASE_URL` |
| `UserPoolId` | `VITE_COGNITO_USER_POOL_ID` |
| `UserPoolClientId` | `VITE_COGNITO_CLIENT_ID` |
| `WebBucketName`, `CloudFrontDistributionId`, `CloudFrontUrl` | usados por `publish-frontend.sh` |

Rutas de la API:

- Publicas: `GET /faqs`, `POST /submissions/business`, `POST /submissions/technical`
- Admin (JWT de Cognito): `/admin/faqs`, `/admin/faqs/{id}`, `/admin/faqs/reorder`,
  `/admin/submissions`, `/admin/submissions/{id}`, `/admin/submissions/{id}/download`

Si cambias una ruta o un campo de los formularios, actualiza tambien el repo del frontend
(`src/services/*` y `src/services/validation.js`).

El catalogo de agentes lo genera `catalogHandler.js` al subir un `.xlsx` al bucket
`redeban-agents-catalog-<cuenta>`, y escribe `data/agents-catalog.json` en el bucket web.
