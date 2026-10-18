import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useApp } from './context/AppContext';
import { DashboardPage } from './pages/DashboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditorPage } from './pages/EditorPage';
import { BatchPage } from './pages/BatchPage';
import { RemovalPage } from './pages/RemovalPage';
import { VerificationPage } from './pages/VerificationPage';
import { IntegrationsPage } from './pages/IntegrationsPage';

export default function App() {
    const { page } = useApp();
    const content = {
        dashboard: <DashboardPage />,
        library: <LibraryPage />,
        editor: <EditorPage />,
        batch: <BatchPage />,
        removal: <RemovalPage />,
        verification: <VerificationPage />,
        integrations: <IntegrationsPage />,
    }[page];

    return <div className="app-layout">
        <Sidebar />
        <div className="main-area">
            <Header />
            <main className="main-content">{content}</main>
        </div>
    </div>;
}
