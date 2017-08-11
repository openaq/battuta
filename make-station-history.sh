#!/bin/bash
set -e

echo "Removing yestderay's stations from history and adding today's..."
DATE=`date +%Y-%m-%d`
rm -f ./history/*
cp ./eea-stations.json ./history/eea-stations-${DATE}.json
echo "...We've made history!"
