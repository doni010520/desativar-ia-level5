require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

const app = express();
// Porta configurada para o EasyPanel
const PORT = process.env.PORT || 3132;

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY não encontradas!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check para o EasyPanel
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor vivo' });
});

// Servir o Front-end
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função de normalização de telefone (Padrão: 55 + DDD + Número)
function gerarVariacoesTelefone(telefone) {
  let telefoneLimpo = telefone.replace(/\D/g, '');
  if (telefoneLimpo.startsWith('55')) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  const variacoes = [];
  if (telefoneLimpo.length === 11) {
    variacoes.push('55' + telefoneLimpo);
    const semNove = telefoneLimpo.substring(0, 2) + telefoneLimpo.substring(3);
    variacoes.push('55' + semNove);
  } else if (telefoneLimpo.length === 10) {
    variacoes.push('55' + telefoneLimpo);
    const comNove = telefoneLimpo.substring(0, 2) + '9' + telefoneLimpo.substring(2);
    variacoes.push('55' + comNove);
  } else {
    variacoes.push('55' + telefoneLimpo);
  }
  return variacoes;
}

// ROTA: Desativar IA
app.post('/api/desativar-ia', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ success: false, message: 'Telefone é obrigatório' });

    const variacoes = gerarVariacoesTelefone(telefone);
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    // Busca o lead na tabela CORRETA: leads_energia_solar
    const { data: leads, error: searchError } = await supabase
      .from('leads_energia_solar')
      .select('*')
      .or(orQuery);

    if (searchError) {
      console.error('❌ Erro Supabase (Busca):', searchError);
      return res.status(500).json({ success: false, message: `Erro no banco: ${searchError.message}` });
    }

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Telefone não encontrado no banco de Energia Solar.' });
    }

    const lead = leads[0];

    // Atualiza o campo ia_on_off para OFF
    const { error: updateError } = await supabase
      .from('leads_energia_solar')
      .update({ ia_on_off: 'OFF' })
      .eq('id', lead.id);

    if (updateError) {
      console.error('❌ Erro Supabase (Update):', updateError);
      return res.status(500).json({ success: false, message: `Erro ao atualizar: ${updateError.message}` });
    }

    res.json({ 
      success: true, 
      message: 'IA desativada com sucesso!', 
      lead: { ...lead, ia_on_off: 'OFF' } 
    });

  } catch (error) {
    console.error('❌ Erro Interno:', error);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

// ROTA: Verificar Status
app.post('/api/verificar-status', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ success: false, message: 'Telefone obrigatório' });

    const variacoes = gerarVariacoesTelefone(telefone);
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    const { data: leads, error } = await supabase
      .from('leads_energia_solar')
      .select('nome, telefone, ia_on_off')
      .or(orQuery);

    if (error) {
      console.error('❌ Erro Supabase (Status):', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead não encontrado' });
    }

    res.json({ success: true, lead: leads[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

// Inicialização vinculando ao 0.0.0.0 para acesso externo no Docker
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor pronto na porta ${PORT}`);
  console.log(`📋 Tabela configurada: leads_energia_solar`);
});
