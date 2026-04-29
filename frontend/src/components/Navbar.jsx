import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

const links = [
  ['/dashboard', 'Dashboard'],
  ['/design', 'Input'],
  ['/load-profile', 'Load Profile'],
  ['/step02-design', 'Technical Design'],
  ['/system-sizing', 'System Sizing'],
  ['/monthly-economics', 'Monthly Economic'],
  ['/cash-flow', 'Cash Flow'],
  ['/financial', 'Financial Indicators'],
  ['/emissions', 'Emission Reduction'],
  ['/sensitivity', 'Sensitivity'],
  ['/pscad', 'Design Analysis'],
  ['/reports', 'Report'],
  ['/projects', 'Saved Case Studies'],
  ['/methodology', 'Methodology & Equations']
];

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  function signOut() { logout(); navigate('/login'); }

  return <aside className="sidebar">
    <div className="brand">
      <div className="logo">CCHP</div>
      <div><h2>Biomass Based Trigeneration Builder for Hotel Sector</h2></div>
    </div>
    <nav>
      {links.map(([to,label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
      {isAdmin && <NavLink to="/cluster-data">Cluster Data</NavLink>}
      {isAdmin && <NavLink to="/admin">Admin Settings</NavLink>}
    </nav>
    <div className="user-box"><p>{user?.name}</p><small>{user?.role}</small><button className="secondary" onClick={signOut}>Logout</button></div>
  </aside>;
}
