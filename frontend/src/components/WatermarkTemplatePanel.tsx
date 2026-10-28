import { TemplateControls } from './TemplateControls';
import { useApp } from '../context/AppContext';
import { useTemplates } from '../context/TemplateContext';

export function WatermarkTemplatePanel() {
    const { settings, watermarkType } = useApp();
    const { templates, activeTemplate, isModified, storageError } = useTemplates();

    return (
        <aside className="panel watermark-template-panel" aria-label="Watermark templates">
            <div className="panel-heading">
                <h2>Templates</h2>
                <span className="muted-label">{templates.length} SAVED</span>
            </div>
            <p className="watermark-template-description">
                Choose a saved preset or save your current settings as a new template.
            </p>

            <TemplateControls />

            <section className="watermark-template-summary" aria-label="Current template settings">
                <h3>Current configuration</h3>
                <dl>
                    <div>
                        <dt>Preset</dt>
                        <dd>{activeTemplate ? activeTemplate.name : 'Unsaved draft'}{isModified ? ' · Modified' : ''}</dd>
                    </div>
                    <div><dt>Type</dt><dd>{watermarkType === 'visible' ? 'Visible' : 'Invisible (planned)'}</dd></div>
                    <div><dt>Layout</dt><dd>{settings.layout === 'pattern' ? 'Repeating pattern' : 'Single watermark'}</dd></div>
                    <div><dt>Opacity</dt><dd>{settings.opacity}%</dd></div>
                    <div><dt>Position</dt><dd>{settings.layout === 'pattern' ? 'Across image' : settings.position.replaceAll('-', ' ')}</dd></div>
                </dl>
            </section>

            {templates.length === 0 && (
                <p className="watermark-template-empty">
                    No saved templates yet. Configure a watermark, then select “Save as new / Manage”.
                </p>
            )}
            {storageError && <p className="watermark-template-error" role="alert">{storageError}</p>}
            <p className="watermark-template-footnote">
                Templates are stored in this browser. Applying a template updates both Editor and Batch settings.
            </p>
        </aside>
    );
}
