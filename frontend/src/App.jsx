import { Navigate, Route, Routes } from 'react-router-dom';
import Protected from './components/Protected';
import Login from './pages/Login';
import Contact from './pages/Contact';
import Dashboard from './pages/Dashboard';
import NewDesign from './pages/NewDesign';
import BMSUpload from './pages/BMSUpload';
import LoadProfile from './pages/LoadProfile';
import Step02Design from './pages/Step02Design';
import MonthlyEconomics from './pages/MonthlyEconomics';
import CashFlow from './pages/CashFlow';
import SystemSizing from './pages/SystemSizing';
import Financial from './pages/Financial';
import Emissions from './pages/Emissions';
import Sensitivity from './pages/Sensitivity';
import Pscad from './pages/Pscad';
import Feasibility from './pages/Feasibility';
import Comparison from './pages/Comparison';
import Reports from './pages/Reports';
import Projects from './pages/Projects';
import Admin from './pages/Admin';
import ClusterData from './pages/ClusterData';
import Methodology from './pages/Methodology';

function P({ children, admin = false }) { return <Protected admin={admin}>{children}</Protected>; }

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/contact-us" element={<P><Contact inApp /></P>} />
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<P><Dashboard /></P>} />
    <Route path="/design" element={<P><NewDesign /></P>} />
    <Route path="/bms" element={<P><BMSUpload /></P>} />
    <Route path="/load-profile" element={<P><LoadProfile /></P>} />
    <Route path="/step02-design" element={<P><Step02Design /></P>} />
    <Route path="/system-sizing" element={<P><SystemSizing /></P>} />
    <Route path="/monthly-economics" element={<P><MonthlyEconomics /></P>} />
    <Route path="/cash-flow" element={<P><CashFlow /></P>} />
    <Route path="/financial" element={<P><Financial /></P>} />
    <Route path="/emissions" element={<P><Emissions /></P>} />
    <Route path="/sensitivity" element={<P><Sensitivity /></P>} />
    <Route path="/pscad" element={<P><Pscad /></P>} />
    <Route path="/feasibility" element={<P><Feasibility /></P>} />
    <Route path="/comparison" element={<P><Comparison /></P>} />
    <Route path="/reports" element={<P><Reports /></P>} />
    <Route path="/projects" element={<P><Projects /></P>} />
    <Route path="/cluster-data" element={<P admin><ClusterData /></P>} />
    <Route path="/admin" element={<P admin><Admin /></P>} />
    <Route path="/methodology" element={<P admin><Methodology /></P>} />
  </Routes>;
}
