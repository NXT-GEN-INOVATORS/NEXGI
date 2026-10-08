import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceInput } from '@/components/visiontrace/VoiceInput';

vi.mock('@/components/visiontrace/Session',()=>({useSession:()=>({user:null,signIn:vi.fn()})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));

describe('VoiceInput error callback',()=>{
 it('mounts without an error callback during a partial refresh',()=>{
  render(<VoiceInput onText={vi.fn()} onBusy={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Speak your question'})).toBeTruthy();
 });
 it('reports errors when a callback is supplied',()=>{
  const onError=vi.fn();
  render(<VoiceInput onText={vi.fn()} onBusy={vi.fn()} onError={onError}/>);
  expect(onError).toHaveBeenCalledWith('');
 });
});