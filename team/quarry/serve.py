#!/usr/bin/env python3
"""Serve the checked-in Quarry build with correct ES-module MIME types."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class QuarryHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.mjs': 'application/javascript',
        '.js': 'application/javascript',
        '.wasm': 'application/wasm',
        '.glb': 'model/gltf-binary',
        '.f32': 'application/octet-stream',
    }

    def send_head(self):
        if urlsplit(self.path).path == '/':
            self.send_response(302)
            self.send_header('Location', '/welcome.html')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, 'Directory listing is disabled')
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', default=8766, type=int)
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent / 'dist'
    handler = partial(QuarryHandler, directory=str(directory))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f'QUARRY: http://{args.bind}:{args.port}/welcome.html', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
