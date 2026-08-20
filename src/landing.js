// Nav background fades in once you scroll past the hero.
const nav = document.getElementById('nav');
function onScroll() {
  if (window.scrollY > 60) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Restrained fade/slide-in for each section as it enters view.
const revealTargets = document.querySelectorAll('.section, .hero-content');
revealTargets.forEach((el) => el.classList.add('reveal'));

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((el) => observer.observe(el));
} else {
  // No IntersectionObserver support — just show everything.
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}
