set -euo pipefail
cd "$(dirname "$0")"

STACK="${STACK:-redeban-gobierno-ia}"
REGION="${REGION:-us-east-1}"
ADMIN_USER="${ADMIN_USER:-admin.coe}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"
: "${SENDER_EMAIL:?Define SENDER_EMAIL (remitente)}"
: "${RECIPIENT_EMAIL:?Define RECIPIENT_EMAIL (destinatario del CoE)}"

step() { echo; echo "==> $*"; }
out()  { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
          --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

step "Cuenta AWS"
aws sts get-caller-identity --output table
echo "Region: $REGION | Stack: $STACK"
read -r -p "Continuar con el despliegue en esta cuenta? [s/N] " ok
[[ "$ok" =~ ^[sSyY]$ ]] || { echo "Cancelado."; exit 1; }

step "Herramientas"
export PATH="$HOME/.local/bin:$PATH"
command -v node >/dev/null || { echo "Falta Node.js"; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || { echo "Se requiere Node 18+ (actual: $NODE_MAJOR)"; exit 1; }
command -v sam >/dev/null || pip install --user aws-sam-cli
sam --version

step "SES: solicitar verificacion de correos (revisa tu bandeja y confirma los enlaces)"
aws ses verify-email-identity --email-address "$SENDER_EMAIL" --region "$REGION"
aws ses verify-email-identity --email-address "$RECIPIENT_EMAIL" --region "$REGION"

step "Pruebas (opcional) y limpieza"
if [ "${RUN_TESTS:-0}" = "1" ]; then npm install && npm test; fi
# sam build instala solo las dependencias de produccion; el AWS SDK ya viene en el runtime de Lambda
rm -rf node_modules .aws-sam
echo "Espacio disponible en CloudShell:"; df -h "$HOME" | tail -1

step "SAM validate / build / deploy"
sam validate --template infra/template.yaml --region "$REGION"
sam build --template infra/template.yaml
sam deploy --stack-name "$STACK" --region "$REGION" \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides "RecipientEmail=$RECIPIENT_EMAIL SenderEmail=$SENDER_EMAIL AllowedOrigin=$ALLOWED_ORIGIN"

API_URL=$(out ApiBaseUrl); POOL_ID=$(out UserPoolId); CLIENT_ID=$(out UserPoolClientId)
CF_URL=$(out CloudFrontUrl)

step "Usuario administrador de Cognito"
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$ADMIN_USER" \
    --message-action SUPPRESS --region "$REGION" >/dev/null 2>&1 || echo "(el usuario ya existe)"
  if aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --username "$ADMIN_USER" \
       --password "$ADMIN_PASSWORD" --permanent --region "$REGION"; then
    echo "Admin listo: $ADMIN_USER"
  else
    echo "AVISO: no se pudo fijar la contrasena del admin (requiere 12+ caracteres con mayuscula, minuscula, numero y simbolo)."
    echo "       Puedes fijarla despues con admin-set-user-password."
  fi
else
  echo "ADMIN_PASSWORD no definido: crea el admin manualmente."
fi

step "Listo"
echo "API:        $API_URL"
echo "UserPoolId: $POOL_ID"
echo "ClientId:   $CLIENT_ID"
echo "Portal:     $CF_URL"
echo
echo "Siguiente paso: en el repo del frontend ejecuta 'bash publish-frontend.sh' (STACK=$STACK)."
if [ "$ALLOWED_ORIGIN" = "*" ]; then
  echo "Recomendado: restringir CORS ->  ALLOWED_ORIGIN=$CF_URL bash deploy-cloudshell.sh"
fi
