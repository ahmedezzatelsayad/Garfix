// P5-P2 FIX (Audit v2 · Phase 5): Lighthouse CI configuration
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/login',
        'http://localhost:3000/signup',
        'http://localhost:3000/contact',
        'http://localhost:3000/dashboard',
      ],
      numberOfRuns: 3,
      startServerCommand: 'bun run dev',
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'lighthouse-reports',
    },
  },
};
