require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

const app = express();
// No Docker/EasyPanel, usamos 0.0.0.0 para garantir que o tráfego externo chegue ao container
const PORT = process.env.PORT || 3132;

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check para o EasyPanel/Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Servidor funcionando' });
});

// Rota principal - servir o HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função para gerar variações do telefone para busca
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
  }
  else if (telefoneLimpo.length === 10) {
    variacoes.push('55' + telefoneLimpo);
    const comNove = telefoneLimpo.substring(0, 2) + '9' + telefoneLimpo.substring(2);
    variacoes.push('55' + comNove);
  }
  
  return variacoes;
}

// Rota para desativar IA
app.post('/api/desativar-ia', async (req, res) => {
  try {
    const { telefone } = req.body;

    if (!telefone) {
      return res.status(400).json({ success: false, message: 'Telefone é obrigatório' });
    }

    const variacoes = gerarVariacoesTelefone(telefone);
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    const { data: leads, error: searchError } = await supabase
      .from('leads')
      .select('*')
      .or(orQuery);

    if (searchError) {
      return res.status(500).json({ success: false, message: 'Erro no banco', error: searchError.message });
    }

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Telefone não encontrado' });
    }

    const lead = leads[0];

    if (lead.ia_on_off === 'OFF') {
      return res.json({ success: true, message: 'IA já estava desativada', lead });
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({ ia_on_off: 'OFF' })
      .eq('id', lead.id);

    if (updateError) {
      return res.status(500).json({ success: false, message: 'Erro ao atualizar' });
    }

    res.json({ success: true, message: 'IA desativada com sucesso!', lead: { ...lead, ia_on_off: 'OFF' } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

// Rota para verificar status
app.post('/api/verificar-status', async (req, res) => {
  try {
    const { telefone } = req.body;
    if (!telefone) return res.status(400).json({ success: false, message: 'Telefone obrigatório' });

    const variacoes = gerarVariacoesTelefone(telefone);
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    const { data: leads, error } = await supabase
      .from('leads')
      .select('nome, telefone, ia_on_off')
      .or(orQuery);

    if (error || !leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Não encontrado' });
    }

    res.json({ success: true, lead: leads[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro interno' });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
