import { useState } from 'react';
import { api, errorMessage } from '../api';
import type { Section } from '../types';

export default function SectionManager({ houseId, sections, onChange }: { houseId: number; sections: Section[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [error, setError] = useState('');

  async function addSection(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api.post(`/houses/${houseId}/sections`, { name, icon, sort_order: sections.length });
      setName('');
      setIcon('');
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function startEdit(section: Section) {
    setEditing(section.id);
    setEditName(section.name);
    setEditIcon(section.icon || '');
  }

  async function saveEdit(sectionId: number) {
    try {
      await api.post(`/houses/${houseId}/sections/${sectionId}/edit`, { name: editName, icon: editIcon });
      setEditing(null);
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function deleteSection(sectionId: number) {
    if (!confirm('Delete this section? It must be empty first.')) return;
    try {
      await api.delete(`/houses/${houseId}/sections/${sectionId}`);
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="panel">
      <h2>Sections</h2>
      <p>Rename sections like Fruits, Snacks, Dairy, Household, or add your own.</p>
      {error && <div className="error">{error}</div>}
      <div className="chips">
        {sections.map((section) => (
          <div key={section.id} className="chip editable-chip">
            {editing === section.id ? (
              <>
                <input className="tiny" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} />
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button onClick={() => saveEdit(section.id)}>Save</button>
              </>
            ) : (
              <>
                <span>{section.icon} {section.name}</span>
                <button onClick={() => startEdit(section)}>Edit</button>
                <button onClick={() => deleteSection(section.id)}>×</button>
              </>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={addSection} className="inline-form compact">
        <input className="emoji-input" placeholder="🍫" value={icon} onChange={(e) => setIcon(e.target.value)} />
        <input placeholder="New section name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="secondary">Add section</button>
      </form>
    </section>
  );
}
