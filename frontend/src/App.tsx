import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useApp } from './context/AppContext';
import { TemplateProvider } from './context/TemplateContext';
import { DashboardPage } from './pages/DashboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { EditorPage } from './pages/EditorPage';
import { BatchPage } from './pages/BatchPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { RemovalPage } from './pages/RemovalPage';
import { VerificationPage } from './pages/VerificationPage';
import { IntegrationsPage } from './pages/IntegrationsPage';

function AppContent() {
    const { page } = useApp();
    const content = {
        dashboard: <DashboardPage />,
        library: <LibraryPage />,
        editor: <EditorPage />,
        batch: <BatchPage />,
        templates: <TemplatesPage />,
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

export default function App() {
    return <TemplateProvider><AppContent /></TemplateProvider>;
}
