<?php

header('Content-Type: text/plain; charset=utf-8');

$url = 'http://127.0.0.1:54868/metrics';

$context = stream_context_create(array(
    'http' => array(
        'method' => 'GET',
        'timeout' => 5,
        'ignore_errors' => true
    )
));

$data = @file_get_contents($url, false, $context);

if ($data === false) {
    http_response_code(502);
    echo "# cloudflared_metrics_up 0\n";
    exit;
}

echo $data;