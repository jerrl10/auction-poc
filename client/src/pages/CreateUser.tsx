import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auctionApi } from '../services/api';
import { useUser } from '../contexts/UserContext';
import './CreateUser.css';

export function CreateUser() {
  const navigate = useNavigate();
  const { loadUsers } = useUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      await auctionApi.createUser({ name, email });

      // Reload users so the new user appears in the selector
      await loadUsers();

      // Reset form
      setName('');
      setEmail('');

      // Go back to auction list instead of forcing user to create auction
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-user-container">
      <div className="create-user-header">
        <h1>Create User</h1>
        <p className="subtitle">Create a user account to participate in auctions</p>
      </div>

      <div className="create-user-content">
        <form onSubmit={handleSubmit} className="create-user-form">
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={() => navigate('/')} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
