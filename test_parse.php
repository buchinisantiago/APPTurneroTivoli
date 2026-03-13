<?php
$url = 'postgresql://postgres.vikozgujekpvxbaiixwg:Cached10sCached10%21@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
$p = parse_url($url);
echo "USER=" . ($p['user'] ?? 'MISSING') . "\n";
echo "PASS=" . ($p['pass'] ?? 'MISSING') . "\n";
echo "HOST=" . ($p['host'] ?? 'MISSING') . "\n";
echo "PORT=" . ($p['port'] ?? 'MISSING') . "\n";
