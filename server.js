const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./conexion');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get('/api/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, mensaje: 'Servidor y MySQL Workbench conectados' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identificador, password } = req.body;
    const limpio = String(identificador || '').trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT u.id, u.rol_id, r.nombre AS rol, u.comercio_id, u.nombre, u.codigo,
              u.correo, u.telefono, u.password_hash, u.vehiculo, u.disponible_reparto, u.activo
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE LOWER(u.correo) = ? OR LOWER(u.codigo) = ?
       LIMIT 1`,
      [limpio, limpio]
    );

    const usuario = rows[0];
    if (!usuario || usuario.password_hash !== String(password || '')) {
      return res.status(401).json({ mensaje: 'Código, correo o contraseña incorrectos.' });
    }
    if (!usuario.activo) {
      return res.status(403).json({ mensaje: 'Usuario deshabilitado por administración.' });
    }

    const { password_hash, ...seguro } = usuario;
    res.json({ usuario: seguro });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al iniciar sesión', error: error.message });
  }
});

app.post('/api/auth/registro', async (req, res) => {
  try {
    const { nombre, codigo, correo, telefono, password } = req.body;
    if (!nombre || !codigo || !correo || !password) {
      return res.status(400).json({ mensaje: 'Completa los campos obligatorios.' });
    }

    const [existentes] = await pool.query(
      'SELECT id FROM usuarios WHERE LOWER(correo) = ? OR LOWER(codigo) = ?',
      [correo.trim().toLowerCase(), codigo.trim().toLowerCase()]
    );
    if (existentes.length > 0) {
      return res.status(409).json({ mensaje: 'El código o correo ya está registrado.' });
    }

    const [result] = await pool.query(
      `INSERT INTO usuarios (rol_id, nombre, codigo, correo, telefono, password_hash, activo)
       VALUES (1, ?, ?, ?, ?, ?, 1)`,
      [nombre.trim(), codigo.trim(), correo.trim().toLowerCase(), telefono || null, password]
    );

    res.status(201).json({
      usuario: {
        id: result.insertId,
        rol_id: 1,
        rol: 'cliente',
        comercio_id: null,
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        correo: correo.trim().toLowerCase(),
        telefono: telefono || null,
        activo: 1,
      },
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar usuario', error: error.message });
  }
});

app.get('/api/puntos-entrega', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM puntos_entrega WHERE activo = 1 ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener puntos de entrega', error: error.message });
  }
});

app.post('/api/puntos-entrega', async (req, res) => {
  try {
    const { nombre, referencia } = req.body;
    const [result] = await pool.query(
      'INSERT INTO puntos_entrega (nombre, referencia, activo) VALUES (?, ?, 1)',
      [nombre, referencia || 'Punto autorizado EMI']
    );
    const [rows] = await pool.query('SELECT * FROM puntos_entrega WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear punto de entrega', error: error.message });
  }
});

app.get('/api/comercios', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comercios ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener comercios', error: error.message });
  }
});

app.patch('/api/comercios/:id/habilitar', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE comercios SET habilitado = IF(habilitado = 1, 0, 1) WHERE id = ?',
      [id]
    );
    const [rows] = await pool.query('SELECT * FROM comercios WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar comercio', error: error.message });
  }
});

app.get('/api/productos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener productos', error: error.message });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { comercio_id, nombre, descripcion, categoria, precio, disponible } = req.body;
    const [result] = await pool.query(
      `INSERT INTO productos (comercio_id, nombre, descripcion, categoria, precio, disponible, activo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        comercio_id || 1,
        nombre,
        descripcion || '',
        categoria === 'Bebidas' || categoria === 'Farmacia' ? categoria : 'Comida',
        Number(precio) || 0,
        disponible === false ? 0 : 1,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear producto', error: error.message });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, categoria, precio, disponible } = req.body;
    await pool.query(
      `UPDATE productos
       SET nombre = ?, descripcion = ?, categoria = ?, precio = ?, disponible = ?
       WHERE id = ?`,
      [nombre, descripcion || '', categoria || 'Comida', Number(precio) || 0, disponible ? 1 : 0, id]
    );
    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al editar producto', error: error.message });
  }
});

app.patch('/api/productos/:id/disponibilidad', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE productos SET disponible = IF(disponible = 1, 0, 1) WHERE id = ?',
      [id]
    );
    const [rows] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cambiar disponibilidad', error: error.message });
  }
});

app.get('/api/pedidos', async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT p.*,
             c.nombre AS cliente_nombre, c.codigo AS cliente_codigo,
             co.nombre AS comercio_nombre, co.distancia AS comercio_distancia,
             re.nombre AS repartidor_nombre, re.vehiculo AS repartidor_vehiculo,
             pe.nombre AS punto_entrega_nombre,
             pa.metodo_pago, pa.comprobante_nombre, pa.estado_qr AS estado_pago_qr
      FROM pedidos p
      JOIN usuarios c ON c.id = p.cliente_id
      LEFT JOIN comercios co ON co.id = p.comercio_id
      LEFT JOIN usuarios re ON re.id = p.repartidor_id
      JOIN puntos_entrega pe ON pe.id = p.punto_entrega_id
      LEFT JOIN pagos pa ON pa.pedido_id = p.id
      ORDER BY p.id DESC
    `);

    const [items] = await pool.query('SELECT * FROM pedido_items ORDER BY id ASC');

    res.json(
      pedidos.map((ped) => ({
        ...ped,
        items: items.filter((it) => it.pedido_id === ped.id),
      }))
    );
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener pedidos', error: error.message });
  }
});

app.post('/api/pedidos', async (req, res) => {
  const conexion = await pool.getConnection();
  try {
    const {
      cliente_id,
      comercio_id,
      punto_entrega_id,
      tipo_pedido = 'comercio',
      descripcion_personalizada = null,
      lugar_compra_personalizado = null,
      presupuesto_aproximado = null,
      costo_envio = 5,
      metodo_pago = 'Efectivo',
      comprobante_nombre = null,
      items = [],
    } = req.body;

    if (!cliente_id || !punto_entrega_id) {
      return res.status(400).json({ mensaje: 'Faltan datos del cliente o punto de entrega.' });
    }

    await conexion.beginTransaction();

    const subtotal =
      tipo_pedido === 'personalizado'
        ? Number(presupuesto_aproximado) || 0
        : items.reduce((sum, i) => sum + Number(i.precio) * Number(i.cantidad), 0);

    const envio = Number(costo_envio) || 5;
    const total = subtotal + envio;

    const [maxRows] = await conexion.query('SELECT COALESCE(MAX(id), 131) + 1 AS nextId FROM pedidos');
    const nextId = maxRows[0].nextId;
    const codigoPedido = `#${String(nextId).padStart(4, '0')}`;
    const codigoEntrega = String(Math.floor(1000 + Math.random() * 9000));

    const [pedidoRes] = await conexion.query(
      `INSERT INTO pedidos
        (id, codigo_pedido, cliente_id, comercio_id, punto_entrega_id, tipo_pedido,
         descripcion_personalizada, lugar_compra_personalizado, presupuesto_aproximado,
         estado, paso_entrega, codigo_entrega, subtotal, costo_envio, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Recibido', 1, ?, ?, ?, ?)`,
      [
        nextId,
        codigoPedido,
        cliente_id,
        tipo_pedido === 'personalizado' ? null : comercio_id,
        punto_entrega_id,
        tipo_pedido,
        descripcion_personalizada,
        lugar_compra_personalizado,
        presupuesto_aproximado,
        codigoEntrega,
        subtotal,
        envio,
        total,
      ]
    );

    if (tipo_pedido === 'comercio' && Array.isArray(items)) {
      for (const item of items) {
        const cantidad = Number(item.cantidad) || 1;
        const precioUnit = Number(item.precio) || 0;
        const prodId = item.productoId || item.id;

        await conexion.query(
          `INSERT INTO pedido_items
            (pedido_id, producto_id, nombre_producto, precio_unitario, cantidad, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [pedidoRes.insertId, prodId, item.nombre, precioUnit, cantidad, precioUnit * cantidad]
        );

        if (prodId) {
          await conexion.query('UPDATE productos SET disponible = 0 WHERE id = ?', [prodId]);
        }
      }
    }

    const esQR = metodo_pago === 'Pago QR';
    await conexion.query(
      `INSERT INTO pagos (pedido_id, metodo_pago, monto, comprobante_nombre, estado_qr)
       VALUES (?, ?, ?, ?, ?)`,
      [
        pedidoRes.insertId,
        esQR ? 'Pago QR' : 'Efectivo',
        total,
        esQR ? comprobante_nombre || 'comprobante_qr.jpg' : null,
        esQR ? 'Pendiente' : 'No aplica',
      ]
    );

    await conexion.commit();
    res.status(201).json({
      id: nextId,
      codigo_pedido: codigoPedido,
      codigo_entrega: codigoEntrega,
      total,
    });
  } catch (error) {
    await conexion.rollback();
    res.status(500).json({ mensaje: 'Error al registrar pedido', error: error.message });
  } finally {
    conexion.release();
  }
});

app.patch('/api/pedidos/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    await pool.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);
    const [rows] = await pool.query('SELECT * FROM pedidos WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar estado', error: error.message });
  }
});

app.patch('/api/pedidos/:id/aceptar-repartidor', async (req, res) => {
  try {
    const { id } = req.params;
    const { repartidor_id } = req.body;
    await pool.query(
      'UPDATE pedidos SET repartidor_id = ?, paso_entrega = 1 WHERE id = ?',
      [repartidor_id, id]
    );
    const [rows] = await pool.query('SELECT * FROM pedidos WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al asignar repartidor', error: error.message });
  }
});

app.patch('/api/pedidos/:id/paso-entrega', async (req, res) => {
  try {
    const { id } = req.params;
    const { paso } = req.body;
    const nuevoEstado = Number(paso) >= 2 ? 'En camino' : 'Aceptado';
    await pool.query(
      'UPDATE pedidos SET paso_entrega = ?, estado = ? WHERE id = ?',
      [paso, nuevoEstado, id]
    );
    const [rows] = await pool.query('SELECT * FROM pedidos WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al avanzar entrega', error: error.message });
  }
});

app.patch('/api/pedidos/:id/confirmar-entrega', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo_entrega } = req.body;

    const [rows] = await pool.query('SELECT codigo_entrega FROM pedidos WHERE id = ?', [id]);
    if (!rows[0]) {
      return res.status(404).json({ mensaje: 'Pedido no encontrado.' });
    }
    if (String(rows[0].codigo_entrega) !== String(codigo_entrega || '').trim()) {
      return res.status(400).json({ mensaje: 'El código de entrega no coincide.' });
    }

    await pool.query(
      "UPDATE pedidos SET estado = 'Entregado', paso_entrega = 3 WHERE id = ?",
      [id]
    );
    res.json({ ok: true, estado: 'Entregado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al confirmar entrega', error: error.message });
  }
});

app.patch('/api/pedidos/:id/verificar-qr', async (req, res) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    await pool.query('UPDATE pagos SET estado_qr = ? WHERE pedido_id = ?', [decision, id]);
    if (decision === 'Rechazado') {
      await pool.query("UPDATE pedidos SET estado = 'Cancelado' WHERE id = ?", [id]);
    }
    res.json({ ok: true, decision });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al verificar pago QR', error: error.message });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.rol_id, r.nombre AS rol, u.comercio_id, u.nombre, u.codigo,
             u.correo, u.telefono, u.vehiculo, u.disponible_reparto, u.activo
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      ORDER BY u.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener usuarios', error: error.message });
  }
});

app.patch('/api/usuarios/:id/disponibilidad-reparto', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE usuarios SET disponible_reparto = IF(disponible_reparto = 1, 0, 1) WHERE id = ?',
      [id]
    );
    const [rows] = await pool.query('SELECT id, disponible_reparto FROM usuarios WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cambiar disponibilidad', error: error.message });
  }
});

app.patch('/api/usuarios/:id/admin', async (req, res) => {
  try {
    const { id } = req.params;
    const { rol_id, activo } = req.body;
    await pool.query(
      'UPDATE usuarios SET rol_id = ?, activo = ? WHERE id = ?',
      [rol_id, activo ? 1 : 0, id]
    );
    const [rows] = await pool.query('SELECT id, rol_id, activo FROM usuarios WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar usuario', error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor EMI Pedidos corriendo en http://localhost:${PORT}`);
});