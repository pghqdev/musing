
// A/B Testing Configuration
const experiments = {
  headline: {
    variants: [
      {
        name: 'control',
        value: 'let the wisdom of the past guide your present',
        subtitle: 'musing transforms your new tab into a personalized sanctuary of timeless quotes — local by default, with optional BYOK intelligence for smarter explanations'
      },
      {
        name: 'privacy-focused',
        value: 'Context-aware quotes. Zero data footprint.',
        subtitle: 'Your AI conversations inspire your quotes. Nothing leaves your device. 100% local processing.'
      }
    ]
  },
  cta: {
    variants: [
      {
        name: 'control',
        text: 'Add to Chrome'
      },
      {
        name: 'action',
        text: 'Install Free Extension'
      }
    ]
  }
};

// Storage key for consistent user experience
const STORAGE_KEY = 'musing_ab_assignments';

function getAssignment(experimentId) {
  let assignments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  
  if (!assignments[experimentId]) {
    const variants = experiments[experimentId].variants;
    const randomIndex = Math.floor(Math.random() * variants.length);
    assignments[experimentId] = variants[randomIndex].name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }
  
  return assignments[experimentId];
}

function applyExperiments() {
  // Apply Headline Experiment
  const headlineAssignment = getAssignment('headline');
  const headlineVariant = experiments.headline.variants.find(v => v.name === headlineAssignment);
  
  if (headlineVariant) {
    const taglineEl = document.querySelector('.tagline');
    const subtitleEl = document.querySelector('.subtitle');
    
    if (taglineEl) taglineEl.textContent = headlineVariant.value;
    if (subtitleEl) subtitleEl.textContent = headlineVariant.subtitle;
    
    console.log(`[A/B] Applied headline variant: ${headlineVariant.name}`);
  }

  // Apply CTA Experiment
  const ctaAssignment = getAssignment('cta');
  const ctaVariant = experiments.cta.variants.find(v => v.name === ctaAssignment);
  
  if (ctaVariant) {
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(btn => {
      // Preserve the icon
      const icon = btn.querySelector('svg');
      btn.textContent = '';
      if (icon) btn.appendChild(icon);
      btn.appendChild(document.createTextNode(' ' + ctaVariant.text));
    });
    
    console.log(`[A/B] Applied CTA variant: ${ctaVariant.name}`);
  }

  // Track exposure (mock)
  console.log('[A/B] Tracking exposure:', {
    headline: headlineAssignment,
    cta: ctaAssignment,
    timestamp: new Date().toISOString()
  });
}

// Run on load
document.addEventListener('DOMContentLoaded', applyExperiments);
