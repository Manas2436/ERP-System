import {useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {api} from '../../services/api';

export default function ResetPassword(){
  const [params]=useSearchParams();
  const [token,setToken]=useState(params.get('token')||'');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [complete,setComplete]=useState(false);
  async function submit(event){
    event.preventDefault();setError('');
    if(password!==confirmPassword){setError('The passwords do not match.');return;}
    setBusy(true);
    try{await api('/auth/reset-password',{method:'POST',body:{token:token.trim(),newPassword:password,confirmPassword}});setComplete(true);}
    catch(failure){setError(failure.message||'The reset link is invalid, expired, or already used.');}
    finally{setBusy(false);}
  }
  return <main className="login-shell"><section className="login-card">
    <p className="eyebrow">ACCOUNT RECOVERY</p><h2>Set a new password</h2>
    <p className="text-secondary mb-4">Choose a password with at least 8 characters.</p>
    {error&&<div className="alert alert-danger mb-3" role="alert">{error}</div>}
    {complete?<><div className="alert alert-success" role="status">Your password has been updated. You can now sign in with it.</div><Link className="btn btn-primary w-100" to="/login">Continue to sign in</Link></>:<form className="login-form" onSubmit={submit}>
      {!params.get('token')&&<label className="form-label" htmlFor="token">Reset token<input id="token" className="form-control form-control-lg" autoComplete="off" required value={token} onChange={event=>setToken(event.target.value)}/></label>}
      <label className="form-label" htmlFor="new-password">New password<input id="new-password" className="form-control form-control-lg" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/></label>
      <label className="form-label" htmlFor="confirm-password">Confirm new password<input id="confirm-password" className="form-control form-control-lg" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>
      <button className="btn btn-primary btn-lg w-100" disabled={busy||!token.trim()||password.length<8||!confirmPassword}>{busy?'Updating…':'Update password'}</button>
    </form>}
    <p className="login-footnote"><Link to="/login">Back to sign in</Link></p>
  </section></main>;
}
