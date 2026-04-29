import React, { createContext, useContext, useMemo, useState } from 'react';
import { apiRequest } from '../api';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [projectId, setProjectIdState] = useState(() => localStorage.getItem('trigen_project_id') || '');
  const [project, setProject] = useState(null);

  function setProjectId(id) {
    const value = String(id || '');
    if (value) localStorage.setItem('trigen_project_id', value);
    else localStorage.removeItem('trigen_project_id');
    setProjectIdState(value);
  }

  async function loadProject(id = projectId) {
    if (!id) return null;
    const data = await apiRequest(`/projects/${id}`);
    setProject(data);
    setProjectId(data.id);
    return data;
  }

  const value = useMemo(() => ({ projectId, setProjectId, project, setProject, loadProject, result: project?.result }), [projectId, project]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext);
}
