import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Git source archives omit the complete local office demo and retain production files', t => {
    const repository = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (repository.status !== 0) {
        t.skip('archive check requires a Git worktree; source archives omit .git metadata');
        return;
    }

    const archive = spawnSync('git', ['archive', '--worktree-attributes', '--format=tar', 'HEAD'], { encoding: null });
    assert.equal(archive.error, undefined, archive.stderr?.toString());
    assert.equal(archive.status, 0, archive.stderr?.toString());
    const listing = spawnSync('tar', ['-tf', '-'], { input: archive.stdout, encoding: 'utf8' });
    assert.equal(listing.error, undefined, listing.stderr);
    assert.equal(listing.status, 0, listing.stderr);

    const paths = listing.stdout.trim().split('\n');
    assert.ok(paths.length > 0, 'expected a nonempty source archive');
    assert.ok(!paths.some(path => path.startsWith('dev/office-demo/') && path !== 'dev/office-demo/'), 'demo descendants must be omitted');
    assert.ok(!paths.includes('test/office-demo.test.js'), 'demo-only test must be omitted');
    assert.ok(paths.includes('.github/extensions/pixel-agents-canvas/src/server.js'));
    assert.ok(paths.includes('.github/extensions/pixel-agents-canvas/test/server.test.js'));
    assert.ok(paths.includes('test/lint-policy.test.js'));
});
