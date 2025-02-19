// Inicializar el gráfico de torta
let pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
        labels: ['Lista 1', 'Lista 2', 'Lista 3', 'Blancos', 'Anulados', 'Recurridos'],
        datasets: [{
            data: [0, 0, 0, 0, 0, 0],
            backgroundColor: [
                'rgba(0, 123, 255, 0.8)',    // Lista 1 - Azul
                'rgba(108, 117, 125, 0.8)',  // Lista 2 - Gris
                'rgba(23, 162, 184, 0.8)',   // Lista 3 - Cian
                'rgba(248, 249, 250, 0.8)',  // Blancos - Blanco
                'rgba(255, 193, 7, 0.8)',    // Anulados - Amarillo
                'rgba(220, 53, 69, 0.8)'     // Recurridos - Rojo
            ],
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right'
            }
        }
    }
});

// Funciones de manejo de sesión
function checkSession() {
    console.log('Verificando sesión...');
    $.get('/api/check-session')
        .done(function(response) {
            console.log('Respuesta de sesión:', response);
            if (response.logged_in) {
                showLoggedInUser(response.user);
            }
        })
        .fail(function(error) {
            console.error('Error al verificar sesión:', error);
        });
}

function showLoggedInUser(user) {
    console.log('Mostrando usuario logueado:', user);

    // Ocultar modal de login
    $('#loginModal').modal('hide');

    setTimeout(() => {
        // 🔥 Restaurar el desplazamiento
        $('body').removeClass('modal-open'); // Eliminar clase de bloqueo
        $('.modal-backdrop').remove(); // Eliminar el fondo oscuro del modal
        $('body, html').css({
            'overflow': 'auto', // Habilitar el scroll
            'height': 'auto' // Ajustar altura de la página
        });

        console.log("Scroll restaurado");
    }, 300); // Esperar a que el modal termine de cerrarse

    // Actualizar UI
    $('#userName').text(user.nombre);
    $('#userInfo').removeClass('d-none');
    $('#btnLogin').addClass('d-none');
    $('#btnLogout').removeClass('d-none');

    // Actualizar la tabla de datos
    const tabla = $('#tabla-datos').DataTable();
    tabla.column(-1).visible(true);
    tabla.draw();
}


function showLoggedOutState() {
    console.log('Mostrando estado deslogueado');
    $('#userInfo').addClass('d-none');
    $('#btnLogin').removeClass('d-none');
    $('#btnLogout').addClass('d-none');
    
    // Forzar la actualización de la tabla
    const tabla = $('#tabla-datos').DataTable();
    tabla.column(-1).visible(false);
    tabla.draw();
}

// Función principal de actualización de datos
function actualizarDatos() {
    console.log('Iniciando actualización de datos...');
    $.ajax({
        url: '/api/datos',
        method: 'GET',
        success: function(response) {
            console.log('Datos recibidos:', response);
            
            // Actualizar estadísticas
            $('#total-sucursales').text(response.estadisticas.total_sucursales);
            $('#sucursales-procesadas').text(response.estadisticas.procesadas);
            $('#sucursales-pendientes').text(response.estadisticas.pendientes);
            $('#ultima-actualizacion').text(response.estadisticas.ultima_actualizacion);

            // Actualizar barra de progreso
            const porcentaje = (response.estadisticas.procesadas / response.estadisticas.total_sucursales * 100).toFixed(1);
            $('#progress-bar').css('width', porcentaje + '%').text(porcentaje + '%');

            // Actualizar totales
            $('#total-lista1').text(response.estadisticas.totales.Lista1);
            $('#total-lista2').text(response.estadisticas.totales.Lista2);
            $('#total-lista3').text(response.estadisticas.totales.Lista3);
            $('#total-blancos').text(response.estadisticas.totales.Blanco);
            $('#total-anulados').text(response.estadisticas.totales.Anulado);
            $('#total-recurridos').text(response.estadisticas.totales.Recurrido);

            // Actualizar el gráfico de torta
            pieChart.data.datasets[0].data = [
                response.estadisticas.totales.Lista1,
                response.estadisticas.totales.Lista2,
                response.estadisticas.totales.Lista3,
                response.estadisticas.totales.Blanco,
                response.estadisticas.totales.Anulado,
                response.estadisticas.totales.Recurrido
            ];
            pieChart.update();

            // Actualizar tabla
            const tabla = $('#tabla-datos').DataTable();
            tabla.clear();

            response.datos.forEach(function(row) {
                const participacion = row.CantidadVotantes > 0 ? 
                    ((row.TotalVotos / row.CantidadVotantes) * 100).toFixed(1) + '%' : 
                    '0%';
                
                const deleteButton = `<button class="btn btn-danger btn-sm delete-btn" data-sucursal="${row.Sucursal}">
                    <i class="fas fa-trash"></i> Borrar
                </button>`;
                
                tabla.row.add([
                    row.Sucursal,
                    row.Procesado ? '<span class="badge bg-success">Procesado</span>' : 
                                '<span class="badge bg-warning">Pendiente</span>',
                    row.CantidadVotantes,
                    row.Lista1,
                    row.Lista2,
                    row.Lista3,
                    row.Blanco,
                    row.Anulado,
                    row.Recurrido,
                    row.TotalVotos,
                    participacion,
                    deleteButton
                ]);
            });

            tabla.draw();

            // Mostrar/ocultar columna de borrado según el estado del login
            const isLoggedIn = $('#userInfo').is(':visible');
            console.log('Estado de login:', isLoggedIn);
            tabla.column(-1).visible(isLoggedIn);
        },
        error: function(xhr, status, error) {
            console.error('Error al obtener datos:', error);
            console.error('Status:', status);
            console.error('Response:', xhr.responseText);
            alert('Error al cargar los datos. Revisa la consola para más detalles.');
        }
    });
}

// Event Handlers
$(document).ready(function() {
    console.log('Inicializando aplicación...');

    console.log(typeof bootstrap);
    
    // Inicializar DataTable

    $('#tabla-datos').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.10.25/i18n/Spanish.json'
        },
        pageLength: 25,
        order: [[0, 'asc']],
        dom: '<"mb-3"l><"mb-3"f>rtip',  // mb-3 para margin-bottom
        columns: [
            { title: 'Sucursal' },
            { title: 'Estado' },
            { title: 'Votantes' },
            { title: 'Lista 1' },
            { title: 'Lista 2' },
            { title: 'Lista 3' },
            { title: 'Blancos' },
            { title: 'Anulados' },
            { title: 'Recurridos' },
            { title: 'Total Votos' },
            { title: '% Participación' },
            { 
                title: 'Acciones',
                visible: false,
                orderable: false,
                className: 'text-center'
            }
        ]
    });

    // Verificar sesión
    checkSession();

    // Cargar datos iniciales
    actualizarDatos();

    // Actualizar datos cada 5 minutos
    setInterval(actualizarDatos, 300000);
});

// Login handlers
$('#btnSubmitLogin').click(function() {
    const username = $('#username').val();
    const password = $('#password').val();
    
    if (!username || !password) {
        $('#loginError').text('Por favor complete todos los campos').removeClass('d-none');
        return;
    }
    
    console.log('Intentando login...');
    $.ajax({
        url: '/api/login',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ username, password }),
        success: function(response) {
            console.log('Login exitoso:', response);
            if (response.success) {
                showLoggedInUser(response.user);
                $('#loginForm')[0].reset();
                $('#loginError').addClass('d-none');

                // // Agregar un pequeño retraso y recargar la página
                // setTimeout(function() {
                //     location.reload();
                // }, 500);  // 500ms de espera antes de recargar
            }
        },
        error: function(xhr) {
            console.error('Error en login:', xhr);
            const response = xhr.responseJSON;
            $('#loginError').text(response?.message || 'Error al iniciar sesión').removeClass('d-none');
        }
    });
});

$('#btnLogout').click(function() {
    console.log('Iniciando logout...');
    $.get('/api/logout')
        .done(function(response) {
            console.log('Logout exitoso:', response);
            showLoggedOutState();
        })
        .fail(function(error) {
            console.error('Error en logout:', error);
        });
});

// Export handler
$('#btn-exportar').click(function() {
    window.location.href = '/api/exportar-excel';
});

// Delete handler
$(document).on('click', '.delete-btn', function() {
    const sucursal = $(this).data('sucursal');
    
    if (confirm(`¿Está seguro que desea borrar los datos de la sucursal ${sucursal}?`)) {
        console.log('Intentando borrar sucursal:', sucursal);
        $.ajax({
            url: `/api/borrar-sucursal/${sucursal}`,
            method: 'DELETE',
            success: function(response) {
                console.log('Sucursal borrada:', response);
                alert('Sucursal eliminada correctamente');
                actualizarDatos();
            },
            error: function(xhr) {
                console.error('Error al borrar sucursal:', xhr);
                const response = xhr.responseJSON;
                alert(response?.error || 'Error al eliminar la sucursal');
            }
        });
    }
});