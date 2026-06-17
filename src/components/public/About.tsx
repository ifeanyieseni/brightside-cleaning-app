import { aboutImages } from '../../config/images'

const points = [
  {
    title: 'Vetted, careful cleaners',
    text: 'Every team member is background-checked and trained on our room-by-room checklist.',
  },
  {
    title: 'Supplies included',
    text: 'We arrive with professional equipment and effective, home-safe products.',
  },
  {
    title: 'Flexible scheduling',
    text: 'Mornings, afternoons, weekends — book the time that works and reschedule easily.',
  },
]

export default function About() {
  return (
    <section className="section section-foam" id="about">
      <div className="container about-grid">
        <div className="about-visual">
          <div className="about-img-main">
            <img src={aboutImages.main.src} alt={aboutImages.main.alt} loading="lazy" />
          </div>
          <div className="about-img-secondary">
            <img src={aboutImages.secondary.src} alt={aboutImages.secondary.alt} loading="lazy" />
          </div>
        </div>

        <div className="about-copy">
          <span className="eyebrow">Why clients stay with us</span>
          <h2>Cleaning that treats your home like ours</h2>
          <p>
            We are a local cleaning company built on consistency: the same careful
            standards on every visit, clear communication, and a team that genuinely
            cares about the details — corners, baseboards, and everything in between.
          </p>
          <div className="about-points">
            {points.map((p, i) => (
              <div className="about-point" key={p.title}>
                <span className="pip">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{p.title}</h4>
                  <p>{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
