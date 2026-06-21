import { Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

const teamMembers = [
  {
    name: 'Gayasha Dilrini',
    role: 'Team Member',
    email: 'dilring@gmail.com',
    initials: 'GD',
    photo: '/gayasha-dilrini.jpg'
  },
  {
    name: 'Dihan Madhusankha',
    role: 'Team Member',
    email: 'dihan@gmail.com',
    initials: 'DM',
    photo: '/dihan-madhusankha.jpg'
  },
  {
    name: 'Krishan Mahendra',
    role: 'Team Member',
    email: 'krishanmahendra2001@hotmail.com',
    initials: 'KM',
    photo: '/krishan-mahendra.jpg'
  }
];

const supervisors = [
  {
    name: 'Dr. Manoj Ranaweera',
    role: 'Main Supervisor',
    note: 'Senior Lecturer, University of Moratuwa',
    initials: 'MR',
    photo: '/dr-manoj-ranaweera.jpg'
  },
  {
    name: 'Eng. Ranjith Padmasiri',
    role: 'Co Supervisor',
    note: 'Former Director General of SEA',
    initials: 'RP',
    photo: '/eng-ranjith-padmasiri.jpg'
  }
];

function MemberPhoto({ person, supervisor = false }) {
  return (
    <div className={`group-avatar ${supervisor ? 'supervisor-avatar' : ''}`}>
      <img src={person.photo} alt={person.name} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      <span>{person.initials}</span>
    </div>
  );
}

function ContactGroup() {
  return (
    <section className="contact-content contact-content-wide app-contact-content">
      <div className="contact-info-panel contact-group-panel">
        <h2>Our Group</h2>

        <div className="group-member-grid">
          {teamMembers.map((member) => (
            <article className="group-card" key={member.email}>
              <MemberPhoto person={member} />
              <h3>{member.name}</h3>
              <p>{member.role}</p>
              <a href={`mailto:${member.email}`}>
                <Mail size={17} />
                {member.email}
              </a>
            </article>
          ))}
        </div>

        <div className="supervisor-grid">
          {supervisors.map((person) => (
            <article className="group-card supervisor-card" key={person.name}>
              <MemberPhoto person={person} supervisor />
              <h3>{person.name}</h3>
              <p>{person.role}</p>
              <small>{person.note}</small>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Contact({ inApp = false }) {
  const navigate = useNavigate();

  if (inApp) {
    return (
      <>
        <PageHeader
          title="Contact Us"
          subtitle="Project team and supervisor contact information for the biomass-based trigeneration feasibility tool."
        />
        <ContactGroup />
      </>
    );
  }

  return (
    <main className="contact-page">
      <button type="button" className="contact-back-button" onClick={() => navigate('/login')}>
        <ArrowLeft size={18} />
        Login
      </button>

      <section className="contact-hero">
        <div className="contact-copy">
          <p>Biomass Based Trigeneration Builder</p>
          <h1>Contact Us</h1>
          <span>For project access, demonstration support, calculation clarification, or report verification, contact the development team by email.</span>
        </div>
      </section>

      <ContactGroup />
    </main>
  );
}
