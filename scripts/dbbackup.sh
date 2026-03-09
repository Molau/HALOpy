#!/bin/bash
runtime=$(date "+%Y%m%d")
sudo -u postgres pg_dump halodb | bzip2 -vf > /home/ubuntu/backup/halodb_$runtime.bz2
aws s3 sync ~/backup s3://halodbbackup
sudo -u postgres rm -f /home/ubuntu/backup/halodb_$runtime.bz2