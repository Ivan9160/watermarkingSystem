import { useState, type FormEvent } from 'react';
import { PageHeading } from '../components/PageHeading';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { useApp } from '../context/AppContext';
import { useTemplates } from '../context/TemplateContext';

export function TemplatesPage() {
    const { setPage, settings, watermarkType } = useApp();
    const {
        templates,
        activeTemplate,
        isModified,
        storageError,
        applyTemplate,
        saveCurrentAsTemplate,
        updateActiveTemplate,
        renameTemplate,
        duplicateTemplate,
        deleteTemplate,
    } = useTemplates();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [notice, setNotice] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    function saveNew(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const id = saveCurrentAsTemplate(name, description);
        if (!id) {
            setNotice('Enter a template name first.');
            return;
        }
        setName('');
        setDescription('');
        setNotice('Current watermark settings saved as a new template.');
    }

    function startRename(id: string, currentName: string) {
        setEditingId(id);
        setEditingName(currentName);
    }

    function finishRename(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (editingId && editingName.trim()) {
            renameTemplate(editingId, editingName);
            setEditingId(null);
            setNotice('Template renamed.');
        }
    }

    function remove(id: string, templateName: string) {
        if (!window.confirm(`Delete "${templateName}" from this browser?`)) return;
        deleteTemplate(id);
        if (editingId === id) setEditingId(null);
        setNotice('Template deleted.');
    }

    function openWithTemplate(id: string, destination: 'editor' | 'batch') {
        applyTemplate(id);
        setPage(destination);
    }

    return (
        <div className="page-shell templates-page">
            <PageHeading
                title="Watermark Templates"
                subtitle="Save and reuse watermark settings across Editor and Batch Processing"
                actions={
                    <button className="btn btn-secondary" onClick={() => setPage('editor')}>
                        Open editor →
                    </button>
                }
            />
            <div className="templates-content scrollable-content">
                {storageError && <p role="alert" className="template-alert">{storageError}</p>}
                {notice && <p role="status" className="template-notice">{notice}</p>}

                <section className="panel template-create-panel">
                    <div className="template-create-form">
                        <div className="panel-heading">
                            <h2>Save current watermark</h2>
                            <span className="muted-label">CURRENT DRAFT</span>
                        </div>
                        <p className="template-description">
                            Adjust your watermark in Editor or Batch, then save the exact current settings here.
                        </p>
                        <form onSubmit={saveNew}>
                            <label className="form-field">
                                <span>Template name</span>
                                <input
                                    type="text"
                                    value={name}
                                    maxLength={60}
                                    placeholder="e.g. Product photos — corner"
                                    onChange={event => setName(event.target.value)}
                                    required
                                />
                            </label>
                            <label className="form-field">
                                <span>Description (optional)</span>
                                <textarea
                                    value={description}
                                    maxLength={180}
                                    rows={3}
                                    placeholder="Where you want to use this watermark"
                                    onChange={event => setDescription(event.target.value)}
                                />
                            </label>
                            <div className="template-create-actions">
                                <button className="btn btn-primary" type="submit">Save new template</button>
                                {activeTemplate && (
                                    <button
                                        className="btn btn-secondary"
                                        type="button"
                                        disabled={!isModified}
                                        onClick={() => {
                                            updateActiveTemplate();
                                            setNotice('Changes saved to selected template.');
                                        }}
                                    >
                                        Update "{activeTemplate.name}"
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                    <div className="template-create-preview">
                        <span className="muted-label">LIVE DRAFT PREVIEW</span>
                        <div className="template-preview-surface">
                            <PreviewCanvas
                                templateOnly
                                settings={settings}
                                visible={watermarkType === 'visible'}
                            />
                        </div>
                        <span className="template-preview-caption">
                            {watermarkType === 'invisible'
                                ? 'Invisible watermark is not implemented yet'
                                : `${settings.layout === 'pattern' ? 'Repeating pattern' : 'Single mark'} · ${settings.opacity}% opacity`}
                        </span>
                    </div>
                </section>

                <div className="templates-list-heading">
                    <div>
                        <h2>Saved templates</h2>
                        <p>{templates.length} saved in this browser</p>
                    </div>
                </div>

                {templates.length === 0 ? (
                    <div className="panel template-empty">
                        <span className="template-empty-icon" aria-hidden="true">▧</span>
                        <h3>No templates yet</h3>
                        <p>Configure a watermark in the Editor, then save it using the form above.</p>
                        <button className="btn btn-primary" onClick={() => setPage('editor')}>Go to Watermark Editor</button>
                    </div>
                ) : (
                    <div className="templates-grid">
                        {templates.map(template => (
                            <article
                                className={`panel template-card${activeTemplate?.id === template.id ? ' template-card--active' : ''}`}
                                key={template.id}
                            >
                                <div className="template-card-preview">
                                    <PreviewCanvas
                                        templateOnly
                                        settings={template.settings}
                                        visible={template.watermarkType === 'visible'}
                                    />
                                </div>
                                <div className="template-card-body">
                                    <div className="template-card-heading">
                                        <div className="template-card-title">
                                            {editingId === template.id ? (
                                                <form className="template-rename-form" onSubmit={finishRename}>
                                                    <input
                                                        autoFocus
                                                        aria-label="New template name"
                                                        value={editingName}
                                                        maxLength={60}
                                                        onChange={event => setEditingName(event.target.value)}
                                                        required
                                                    />
                                                    <button className="btn btn-primary" type="submit">Save</button>
                                                    <button className="btn btn-secondary" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                                                </form>
                                            ) : (
                                                <h3 title={template.name}>{template.name}</h3>
                                            )}
                                        </div>
                                        {activeTemplate?.id === template.id && (
                                            <span className="template-active-badge">{isModified ? 'Modified' : 'Applied'}</span>
                                        )}
                                    </div>
                                    {template.description && <p className="template-card-description">{template.description}</p>}
                                    <div className="template-card-meta">
                                        <span>{template.watermarkType === 'visible' ? 'Visible' : 'Invisible (planned)'}</span>
                                        <span>{template.settings.layout === 'pattern' ? 'Pattern' : 'Single'}</span>
                                        <span>{template.settings.opacity}% opacity</span>
                                    </div>
                                    <span className="template-card-updated">Updated {new Date(template.updatedAt).toLocaleDateString()}</span>
                                    <div className="template-card-main-actions">
                                        <button className="btn btn-primary" onClick={() => openWithTemplate(template.id, 'editor')}>
                                            Edit in Editor
                                        </button>
                                        <button className="btn btn-secondary" onClick={() => openWithTemplate(template.id, 'batch')}>
                                            Use in Batch
                                        </button>
                                    </div>
                                    <div className="template-card-secondary-actions">
                                        <button type="button" onClick={() => startRename(template.id, template.name)}>Rename</button>
                                        <button type="button" onClick={() => { duplicateTemplate(template.id); setNotice('Template duplicated.'); }}>Duplicate</button>
                                        <button type="button" className="template-delete" onClick={() => remove(template.id, template.name)}>Delete</button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <p className="templates-storage-note">
                    Templates are stored locally in this browser.
                </p>
            </div>
        </div>
    );
}
