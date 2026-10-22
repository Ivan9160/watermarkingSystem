import { useApp } from '../context/AppContext';
import { useTemplates } from '../context/TemplateContext';

export function TemplateControls() {
    const { setPage } = useApp();
    const {
        templates,
        activeTemplate,
        isModified,
        applyTemplate,
        detachTemplate,
        updateActiveTemplate,
    } = useTemplates();

    return (
        <div className="template-controls">
            <label className="form-field template-selector">
                <span>Saved watermark template</span>
                <select
                    value={activeTemplate?.id ?? ''}
                    onChange={event => event.target.value
                        ? applyTemplate(event.target.value)
                        : detachTemplate()}
                >
                    <option value="">Current draft (unsaved)</option>
                    {templates.map(template => (
                        <option key={template.id} value={template.id}>
                            {template.name}
                        </option>
                    ))}
                </select>
            </label>
            {activeTemplate && (
                <p className={`template-status${isModified ? ' template-status--modified' : ''}`}>
                    {isModified ? 'Unsaved changes to selected template' : 'Template applied'}
                </p>
            )}
            <div className="template-control-actions">
                <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setPage('templates')}
                >
                    Save as new / Manage
                </button>
                {activeTemplate && (
                    <button
                        className="btn btn-primary"
                        type="button"
                        disabled={!isModified}
                        onClick={updateActiveTemplate}
                        title="Overwrite this saved template with current settings"
                    >
                        Save changes
                    </button>
                )}
            </div>
        </div>
    );
}
