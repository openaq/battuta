#!/usr/bin/env bash
set -e # halt script on error

echo "Updating station locations!"

# useful env variables
SSH_REPO="git@github.com:${TRAVIS_REPO_SLUG}.git"
SHA=`git rev-parse --verify HEAD`

# Initialize repo
git init
git config user.name "Travis-CI"
git config user.email "travis@example.com"
git add .
git commit -m "CI deploy to feature/nightly-build ${SHA}"
git show-ref

# Get deploy key by using Travis's stored variables to decrypt deploy_key.enc

ENCRYPTED_KEY_VAR="encrypted_${ENCRYPTION_LABEL}_key"
ENCRYPTED_IV_VAR="encrypted_${ENCRYPTION_LABEL}_iv"
ENCRYPTED_KEY=${!ENCRYPTED_KEY_VAR}
ENCRYPTED_IV=${!ENCRYPTED_IV_VAR}
openssl aes-256-cbc -K $ENCRYPTED_KEY -iv $ENCRYPTED_IV -in ../.update_data/deploy_key.enc -out deploy_key -d

chmod 600 deploy_key
eval `ssh-agent -s`
ssh-add deploy_key

git push --force --quiet $SSH_REPO 'feature/nightly-build'
