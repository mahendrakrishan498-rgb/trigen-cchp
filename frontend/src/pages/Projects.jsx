import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { apiRequest } from '../api';
import { useProject } from '../state/ProjectContext';

export default function Projects() {
  const { setProjectId, setProject, loadProject } = useProject();
  const [projects, setProjects] = useState([]);
  async function load() { setProjects(await apiRequest('/projects')); }
  useEffect(() => { load().catch(() => {}); }, []);
  async function open(id) { const p = await loadProject(id); setProject(p); setProjectId(id); }
  async function del(id) { await apiRequest(`/projects/${id}`, { method: 'DELETE' }); await load(); }
  return (
    <>
      <PageHeader title="Saved Case Studies" subtitle="Open previous designs and continue with BMS, PSCAD, comparison, or PDF report." />
      <section className="panel"><table className="data-table"><thead><tr><th>Title</th><th>Hotel</th><th>Location</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{projects.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.hotel_name}</td><td>{p.location}</td><td>{new Date(p.updated_at).toLocaleString()}</td><td><button onClick={() => open(p.id)}>Open</button><button className="danger" onClick={() => del(p.id)}>Delete</button></td></tr>)}</tbody></table></section>
    </>
  );
}
