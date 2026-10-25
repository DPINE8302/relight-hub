import unittest, tempfile, zipfile, json, importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('packages', Path(__file__).resolve().parents[1] / 'scripts/package-downloads.py')
packages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packages)

class PackagePrivacy(unittest.TestCase):
    def test_private_runtime_data_and_environment_are_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.mkdir(); packages.out = root / 'out'
            for name in ['app/main.ts', '.env.local', '.next/server.txt', '.wall-data/wall.sqlite', 'local.db','runtime.sqlite-journal','.cache/private-runtime.json', 'node_modules/private.txt']:
                p = source / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('fixture')
            archive = packages.archive('test.zip', source)
            with zipfile.ZipFile(archive) as z:
                self.assertEqual([n for n in z.namelist() if n.startswith('site/')], ['site/app/main.ts'])

    def test_source_manifest_is_exact_and_rejects_changed_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.mkdir(); packages.out = root / 'out'
            (source / 'main.ts').write_text('source')
            (source / 'unlisted.txt').write_text('not distributed')
            (source / 'SOURCE-SNAPSHOT.md').write_text('scope')
            (source / 'SOURCE-SNAPSHOT.json').write_text(json.dumps({'hashes': {'main.ts': packages.sha(b'source')}}))
            archive = packages.archive('test.zip', source, website=False)
            with zipfile.ZipFile(archive) as z:
                self.assertNotIn('unlisted.txt', z.namelist())
            (source / 'main.ts').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'Stale'):
                packages.archive('test.zip', source, website=False)

    def test_linked_files_cannot_escape_package(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root / 'source'; source.mkdir(); packages.out = root / 'out'
            (root / 'private.txt').write_text('private fixture')
            (source / 'linked.txt').symlink_to(root / 'private.txt')
            with self.assertRaisesRegex(ValueError, 'linked file'):
                packages.archive('test.zip', source)

    def test_source_archive_fails_closed_without_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp); (source / 'scratch.txt').write_text('unlisted')
            with self.assertRaisesRegex(ValueError, 'requires.*manifest'):
                packages.archive('test.zip', source, website=False)

    def test_linked_archive_root_is_rejected_before_resolving(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); private=root/'private'; private.mkdir(); (private/'operator-notes.txt').write_text('private fixture'); linked=root/'public'; linked.symlink_to(private)
            with self.assertRaisesRegex(ValueError,'linked'):
                packages.archive('test.zip',linked)

    def test_source_checksum_files_are_not_rewritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source'; source.mkdir(); packages.out=root/'out'
            files={'main.ts':b'/prefix/source','SHA256SUMS.json':b'{"main.ts":"source-owned-value"}','CURRENT-ASSETS.json':b'{"main.ts":"source-owned-value"}'}
            for name,data in files.items(): (source/name).write_bytes(data)
            (source/'SOURCE-SNAPSHOT.md').write_text('source')
            (source/'SOURCE-SNAPSHOT.json').write_text(json.dumps({'hashes':{name:packages.sha(data) for name,data in files.items()}}))
            with zipfile.ZipFile(packages.archive('test.zip',source,prefix='/prefix/',website=False)) as z:
                for name,data in files.items(): self.assertEqual(z.read(name),data)

    def test_linked_archive_and_checksum_outputs_preserve_private_inode(self):
        for link in ['symlink','hardlink']:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp); source=root/'source'; source.mkdir(); (source/'index.html').write_text('public fixture'); packages.out=root/'out'; packages.out.mkdir()
                private=root/'runtime.db'; private.write_text('private fixture')
                archive=packages.out/'test.zip'; checksum=packages.out/'SHA256SUMS.txt'
                if link=='symlink':
                    archive.symlink_to(private); checksum.symlink_to(private)
                else:
                    import os
                    os.link(private,archive); os.link(private,checksum)
                packages.archive('test.zip',source); packages.write_atomic(checksum,b'public checksum')
                self.assertEqual(private.read_text(),'private fixture')
                with zipfile.ZipFile(archive) as z: self.assertIn('site/index.html',z.namelist())
                self.assertEqual(checksum.read_bytes(),b'public checksum')

    def test_linked_output_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source'; source.mkdir(); private=root/'private'; private.mkdir(); packages.out=root/'out'; packages.out.symlink_to(private)
            with self.assertRaisesRegex(ValueError,'linked'): packages.archive('test.zip',source)
            self.assertEqual(list(private.iterdir()),[])

if __name__ == '__main__':
    unittest.main()
