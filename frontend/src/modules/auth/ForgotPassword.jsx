import {useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../../services/api';

export default function ForgotPassword(){
  const [identifier,setIdentifier]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [submitted,setSubmitted]=useState(false);
  async function submit(event){
    event.preventDefault();setError('');setBusy(true);
    try{await api('/auth/forgot-password',{method:'POST',body:{identifier:identifier.trim()}});setSubmitted(true);}
    catch(failure){setError(failure.message||'Password reset could not be requested. Try again or contact your administrator.');}
    finally{setBusy(false);}
  }
  return <main className="login-shell"><section className="login-card">
    <p className="eyebrow">ACCOUNT RECOVERY</p><h2>Forgot password?</h2>
    <p className="text-secondary mb-4">Enter your username or registered email address.</p>
    {error&&<div className="alert alert-danger mb-3" role="alert">{error}</div>}
    {submitted?<div className="alert alert-success" role="status">If an active account matches and email delivery is available, reset instructions will be sent to its registered email address. If they do not arrive, contact your system administrator.</div>:<form className="login-form" onSubmit={submit}>
      <label className="form-label" htmlFor="identifier">Username or email
        <input id="identifier" className="form-control form-control-lg" autoComplete="username" required maxLength={120} value={identifier} onChange={event=>setIdentifier(event.target.value)}/>
      </label>
      <button className="btn btn-primary btn-lg w-100" disabled={busy||!identifier.trim()}>{busy?'Sending…':'Send reset instructions'}</button>
    </form>}
    <p className="login-footnote"><Link to="/login">Back to sign in</Link></p>
  </section></main>;
}
