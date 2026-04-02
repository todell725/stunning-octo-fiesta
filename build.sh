#!/usr/bin/env bash
# Build and push multi-platform images (linux/amd64 + linux/arm64)
# Usage:
#   ./build.sh                          # build only, load into local Docker
#   ./build.sh --push --registry myuser # build + push to Docker Hub as myuser/invoice-tracker-*
#   ./build.sh --push --registry ghcr.io/myorg

set -euo pipefail

PLATFORMS="linux/amd64,linux/arm64"
REGISTRY=""
PUSH=false
TAG="${TAG:-latest}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --push)       PUSH=true ;;
    --registry)   REGISTRY="$2"; shift ;;
    --tag)        TAG="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

SERVER_IMAGE="${REGISTRY:+${REGISTRY}/}invoice-tracker-server:${TAG}"
CLIENT_IMAGE="${REGISTRY:+${REGISTRY}/}invoice-tracker-client:${TAG}"

# Ensure buildx builder with multi-arch support exists
if ! docker buildx inspect multiarch &>/dev/null; then
  echo "Creating multi-arch buildx builder..."
  docker buildx create --name multiarch --driver docker-container --bootstrap
fi
docker buildx use multiarch

BUILD_FLAGS="--platform ${PLATFORMS}"
if $PUSH; then
  BUILD_FLAGS="${BUILD_FLAGS} --push"
  echo "Will push to registry: ${REGISTRY:-Docker Hub}"
else
  # --load only supports single platform; build both but load amd64 for local use
  BUILD_FLAGS="${BUILD_FLAGS} --load"
  echo "Note: --load with multi-platform loads only the native arch image locally."
  echo "Use --push to produce a true multi-arch manifest."
fi

echo ""
echo "Building server image: ${SERVER_IMAGE}"
docker buildx build ${BUILD_FLAGS} \
  --tag "${SERVER_IMAGE}" \
  --cache-from "type=registry,ref=${SERVER_IMAGE}-cache" \
  $(${PUSH} && echo "--cache-to type=registry,ref=${SERVER_IMAGE}-cache,mode=max" || echo "") \
  ./server

echo ""
echo "Building client image: ${CLIENT_IMAGE}"
docker buildx build ${BUILD_FLAGS} \
  --tag "${CLIENT_IMAGE}" \
  --cache-from "type=registry,ref=${CLIENT_IMAGE}-cache" \
  $(${PUSH} && echo "--cache-to type=registry,ref=${CLIENT_IMAGE}-cache,mode=max" || echo "") \
  ./client

echo ""
echo "Done!"
if $PUSH; then
  echo "Pushed:"
  echo "  ${SERVER_IMAGE}"
  echo "  ${CLIENT_IMAGE}"
else
  echo "To run locally:"
  echo "  docker compose up"
fi
