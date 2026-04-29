import PageHeader from '../components/PageHeader';
import { downloadPdf } from '../api';
import { useProject } from '../state/ProjectContext';

export default function Reports() {
  const { projectId, project } = useProject();

  async function handleDownload() {
    if (!projectId) {
      alert('Please save or open a project first.');
      return;
    }

    try {
      await downloadPdf(projectId);
    } catch (error) {
      alert('PDF generation failed. Check backend terminal and make sure the project is saved.');
    }
  }

  return (
    <>
      <PageHeader
        title="Report"
        subtitle="Download the final feasibility report PDF using the saved project tables and calculation results."
      />

      <section className="panel">
        <h3>Selected Project</h3>
        <p>
          {project
            ? `${project.title || 'Project'} ${project.hotel_name ? `- ${project.hotel_name}` : ''}`
            : projectId
              ? `Project ID ${projectId}`
              : 'No selected project'}
        </p>

        <button disabled={!projectId} onClick={handleDownload}>
          Download PDF Report
        </button>

        <p className="muted">
          If you changed inputs, click Save Project first. The report uses the saved MySQL project results.
        </p>
      </section>
    </>
  );
}
