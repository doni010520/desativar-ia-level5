require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');

const app = express();
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

// Rota principal - servir o HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função para gerar variações do telefone para busca
// Banco SEMPRE tem 55 no início
// Usuário digita apenas DDD + número (com ou sem 9)
function gerarVariacoesTelefone(telefone) {
  // Limpar o telefone (remover caracteres especiais)
  let telefoneLimpo = telefone.replace(/\D/g, '');
  
  // Se usuário digitou com 55, remove (vamos adicionar depois)
  if (telefoneLimpo.startsWith('55')) {
    telefoneLimpo = telefoneLimpo.substring(2);
  }
  
  const variacoes = [];
  
  // Se tem 11 dígitos (DDD + 9 + 8 dígitos)
  if (telefoneLimpo.length === 11) {
    // Com 9: 55 + 11988887777 = 5511988887777
    variacoes.push('55' + telefoneLimpo);
    
    // Sem 9: 55 + 1188887777 = 551188887777
    const semNove = telefoneLimpo.substring(0, 2) + telefoneLimpo.substring(3);
    variacoes.push('55' + semNove);
  }
  // Se tem 10 dígitos (DDD + 8 dígitos, sem 9)
  else if (telefoneLimpo.length === 10) {
    // Sem 9: 55 + 1188887777 = 551188887777
    variacoes.push('55' + telefoneLimpo);
    
    // Com 9: 55 + 11988887777 = 5511988887777
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
      return res.status(400).json({ 
        success: false, 
        message: 'Telefone é obrigatório' 
      });
    }

    // Gerar todas as variações possíveis do telefone
    const variacoes = gerarVariacoesTelefone(telefone);
    
    console.log(`📞 Buscando telefone com variações:`, variacoes);

    // Criar query OR para todas as variações
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    // Buscar o registro pelo telefone (qualquer variação)
    const { data: leads, error: searchError } = await supabase
      .from('leads')
      .select('*')
      .or(orQuery);

    if (searchError) {
      console.error('❌ Erro ao buscar:', searchError);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro ao buscar no banco de dados',
        error: searchError.message
      });
    }

    if (!leads || leads.length === 0) {
      console.log('⚠️ Telefone não encontrado em nenhuma variação');
      return res.status(404).json({ 
        success: false, 
        message: 'Telefone não encontrado no banco de dados. Variações testadas: ' + variacoes.join(', ')
      });
    }

    const lead = leads[0];
    console.log(`✅ Lead encontrado: ${lead.nome} (${lead.telefone}) - Status atual: ${lead.ia_on_off}`);

    // Verificar se já está desativado
    if (lead.ia_on_off === 'OFF') {
      return res.json({ 
        success: true, 
        message: 'IA já estava desativada para este telefone',
        lead: {
          nome: lead.nome,
          telefone: lead.telefone,
          status_anterior: lead.ia_on_off,
          status_atual: 'OFF'
        }
      });
    }

    // Atualizar para OFF
    const { data: updatedData, error: updateError } = await supabase
      .from('leads')
      .update({ ia_on_off: 'OFF' })
      .eq('id', lead.id)
      .select();

    if (updateError) {
      console.error('❌ Erro ao atualizar:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar o banco de dados',
        error: updateError.message
      });
    }

    console.log('✅ IA desativada com sucesso!');

    res.json({ 
      success: true, 
      message: 'IA desativada com sucesso!',
      lead: {
        nome: lead.nome,
        telefone: lead.telefone,
        status_anterior: lead.ia_on_off,
        status_atual: 'OFF'
      }
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Rota para verificar status
app.post('/api/verificar-status', async (req, res) => {
  try {
    const { telefone } = req.body;

    if (!telefone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Telefone é obrigatório' 
      });
    }

    // Gerar todas as variações possíveis do telefone
    const variacoes = gerarVariacoesTelefone(telefone);
    
    console.log(`🔍 Verificando status com variações:`, variacoes);

    // Criar query OR para todas as variações
    const orQuery = variacoes.map(v => `telefone.eq.${v}`).join(',');

    const { data: leads, error } = await supabase
      .from('leads')
      .select('nome, telefone, ia_on_off')
      .or(orQuery);

    if (error) {
      return res.status(500).json({ 
        success: false, 
        message: 'Erro ao buscar no banco de dados',
        error: error.message
      });
    }

    if (!leads || leads.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Telefone não encontrado. Variações testadas: ' + variacoes.join(', ')
      });
    }

    console.log(`✅ Status encontrado: ${leads[0].nome} - IA: ${leads[0].ia_on_off}`);

    res.json({ 
      success: true, 
      lead: leads[0]
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🔗 Supabase URL: ${supabaseUrl}`);
});
